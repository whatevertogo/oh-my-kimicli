import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "bun:test";

import { runInsightsCli } from "../lib/insights/cli.ts";
import { insightsPaths, prepareInsightsEvidence, renderInsightsReport } from "../lib/insights/report.ts";
import { buildSessionMeta } from "../lib/insights/meta.ts";
import { scanSessions } from "../lib/insights/scan.ts";
import { readWireTurns } from "../lib/insights/wire.ts";
import { cacheFile } from "../lib/insights/cache.ts";
import { doctor, setup, uninstall } from "../lib/setup.ts";

async function withTempHomes(fn) {
  const dir = mkdtempSync(join(tmpdir(), "omk-insights-"));
  const env = {
    ...process.env,
    KIMI_SHARE_DIR: join(dir, ".kimi"),
    KIMI_USER_SKILLS_DIR: join(dir, ".kimi-skills"),
    OMK_HOME: join(dir, ".omk")
  };
  const oldEnv = {
    KIMI_SHARE_DIR: process.env.KIMI_SHARE_DIR,
    KIMI_USER_SKILLS_DIR: process.env.KIMI_USER_SKILLS_DIR,
    OMK_HOME: process.env.OMK_HOME
  };
  Object.assign(process.env, env);
  try {
    return await fn(dir, env);
  } finally {
    restoreEnv(oldEnv);
    rmSync(dir, { recursive: true, force: true });
  }
}

function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function writeSession(env, { workDir, sessionId, turns }) {
  const hash = createHash("md5").update(workDir, "utf8").digest("hex");
  const sessionDir = join(env.KIMI_SHARE_DIR, "sessions", hash, sessionId);
  const wirePath = join(sessionDir, "wire.jsonl");
  mkdirSync(sessionDir, { recursive: true });
  const lines = [{ type: "metadata", protocol_version: "1" }];
  let timestamp = 1770000000;
  for (const turn of turns) {
    lines.push(record(timestamp++, "TurnBegin", { user_input: turn.user }));
    lines.push(record(timestamp++, "StepBegin", { n: 1 }));
    if (turn.assistant) {
      lines.push(record(timestamp++, "TextPart", { text: turn.assistant }));
    }
    for (const tool of turn.tools || []) {
      lines.push(
        record(timestamp++, "ToolCall", {
          id: tool.id,
          function: {
            name: tool.name,
            arguments: JSON.stringify(tool.arguments || {})
          }
        })
      );
      lines.push(
        record(timestamp++, "ToolResult", {
          tool_call_id: tool.id,
          return_value: { is_error: Boolean(tool.error), content: tool.error || "ok" }
        })
      );
    }
    lines.push(
      record(timestamp++, "StatusUpdate", {
        token_usage: {
          input_other: 10,
          input_cache_read: 2,
          input_cache_creation: 3,
          output: 4
        }
      })
    );
    lines.push(record(timestamp++, "TurnEnd", {}));
  }
  writeFileSync(wirePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  writeFileSync(join(sessionDir, "context.jsonl"), "", "utf8");
  mkdirSync(env.KIMI_SHARE_DIR, { recursive: true });
  writeFileSync(
    join(env.KIMI_SHARE_DIR, "kimi.json"),
    JSON.stringify({ work_dirs: [{ path: workDir, kaos: "local" }] }),
    "utf8"
  );
  return { hash, sessionDir, wirePath };
}

function record(timestamp, type, payload) {
  return { timestamp, message: { type, payload } };
}

test("insights prepare generates an evidence pack with real session excerpts", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        {
          user: "review this cache layer and find risks",
          assistant: "I will inspect the relevant files first.",
          tools: [{ id: "t1", name: "ReadFile", arguments: { path: "src/cache.ts" } }]
        },
        {
          user: "fix the failing test and keep evidence",
          assistant: "The test fails because the cache is not invalidated.",
          tools: [{ id: "t2", name: "Shell", arguments: { command: "bun test" }, error: "Exit Code 1" }]
        },
        { user: "/skill:insights" }
      ]
    });

    const evidence = await prepareInsightsEvidence({ env, limit: 20, facetLimit: 10 });
    const paths = insightsPaths(env);
    const markdown = readFileSync(paths.evidenceMarkdownPath, "utf8");
    const payload = JSON.parse(readFileSync(paths.evidenceJsonPath, "utf8"));

    assert.equal(existsSync(paths.evidenceMarkdownPath), true);
    assert.equal(existsSync(paths.evidenceJsonPath), true);
    assert.equal(existsSync(paths.schemaPath), true);
    assert.equal(payload.schema_version, 2);
    assert.equal(payload.session_evidence.length, 1);
    assert.match(markdown, /review this cache layer/);
    assert.match(markdown, /Exit Code 1/);
    assert.match(markdown, /Write exactly one JSON object/);
    assert.match(markdown, /At a Glance last/);
    assert.doesNotMatch(markdown, /TurnBegin/);
    assert.equal(evidence.scannedSessions, 1);
  }));

test("insights prepare prefers Chinese when session evidence is Chinese", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "请你 review 这个方案，并指出有什么风险" }, { user: "继续修复这个问题" }]
    });

    const evidence = await prepareInsightsEvidence({ env });

    assert.equal(evidence.preferred_output_language.code, "zh");
    assert.match(readFileSync(insightsPaths(env).evidenceMarkdownPath, "utf8"), /natural Simplified Chinese/);
  }));

test("insights prepare redacts common secret shapes from evidence files", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "use OPENAI_API_KEY=sk-1234567890abcdef for this test" }]
    });

    const evidence = await prepareInsightsEvidence({ env });
    const markdown = readFileSync(insightsPaths(env).evidenceMarkdownPath, "utf8");
    const json = readFileSync(insightsPaths(env).evidenceJsonPath, "utf8");

    assert.match(evidence.session_evidence[0].first_prompt, /<redacted/);
    assert.doesNotMatch(markdown, /sk-1234567890abcdef/);
    assert.doesNotMatch(json, /sk-1234567890abcdef/);
  }));

test("insights render consumes insights-content.json and writes escaped HTML", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });
    await prepareInsightsEvidence({ env });
    const paths = insightsPaths(env);
    writeFileSync(
      paths.contentPath,
      JSON.stringify({
        schema_version: 1,
        language: "zh-CN",
        facets: [
          {
            session_id: "s1",
            goal_categories: { review: 1 },
            outcome: "mostly_achieved",
            user_satisfaction_counts: { satisfied: 1 },
            friction_counts: { tool_error: 1 }
          }
        ],
        sections: {
          at_a_glance: {
            whats_working: "<strong>escaped</strong>",
            whats_hindering: "工具错误需要被记录。",
            quick_wins: "把重复偏好写入 AGENTS.md。",
            ambitious_workflows: "用 insights 反推 skill。"
          },
          project_areas: { areas: [{ name: "OMK", session_count: 1, description: "插件工作流。" }] },
          interaction_style: { narrative: "你倾向于持续校准。", key_pattern: "先质疑，再收敛。" },
          what_works: { intro: "审查驱动有效。", impressive_workflows: [] },
          friction_analysis: { intro: "主要摩擦是工具失败。", categories: [] },
          suggestions: { kimi_instructions_additions: [], features_to_try: [], usage_patterns: [] },
          on_the_horizon: { intro: "", opportunities: [] },
          skill_opportunities: { candidates: [] }
        },
        quality: { evidence_strength: "mixed", omitted_sections: ["on_the_horizon"], data_limits: [] }
      }),
      "utf8"
    );

    const report = await renderInsightsReport({ env });
    const html = readFileSync(paths.reportHtmlPath, "utf8");
    const json = JSON.parse(readFileSync(paths.reportJsonPath, "utf8"));

    assert.equal(report.mode, "narrative");
    assert.equal(json.facets_summary.total, 1);
    assert.match(html, /&lt;strong&gt;escaped&lt;\/strong&gt;/);
    assert.match(html, /At a Glance/);
    assert.doesNotMatch(html, /在地平线上|Skill 机会|brand-mark|prompt-card/);
  }));

test("insights render rejects malformed content instead of producing an empty report", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }]
    });
    await prepareInsightsEvidence({ env });
    const paths = insightsPaths(env);
    writeFileSync(
      paths.contentPath,
      JSON.stringify({
        schema_version: 1,
        language: "zh-CN",
        facets: [],
        sections: { at_a_glance: {} },
        quality: { evidence_strength: "mixed" }
      }),
      "utf8"
    );

    await assert.rejects(() => renderInsightsReport({ env }), /sections\.at_a_glance\.whats_working is required/);
  }));

test("insights turn filtering keeps other turns in the same session", () =>
  withTempHomes((dir, env) => {
    const { wirePath } = writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "real task one" }, { user: "/skill:insights" }, { user: "real task two" }]
    });
    const session = scanSessions(env)[0];
    const turns = readWireTurns(wirePath);
    const meta = buildSessionMeta(session, turns);

    assert.equal(turns.length, 3);
    assert.equal(turns.filter((turn) => turn.internal).length, 1);
    assert.equal(meta.userMessageCount, 2);
    assert.equal(meta.firstPrompt, "real task one");
    assert.equal(meta.isMetaSession, false);
  }));

test("insights cache key includes work directory hash", () => {
  const env = { OMK_HOME: "C:\\tmp\\omk" };
  const first = cacheFile("session-meta", { workDirHash: "aaa", sessionId: "same" }, env);
  const second = cacheFile("session-meta", { workDirHash: "bbb", sessionId: "same" }, env);

  assert.notEqual(first, second);
});

test("insights skill uses prepare content render workflow", () => {
  const text = readFileSync(join(import.meta.dir, "..", "skills", "insights", "SKILL.md"), "utf8");

  assert.match(text, /^---\nname: insights\n/m);
  assert.match(text, /omk insights prepare/);
  assert.match(text, /evidence-pack\.md/);
  assert.match(text, /insights-content\.json/);
  assert.match(text, /omk insights render/);
  assert.match(text, /At a Glance.*last/s);
  assert.doesNotMatch(text, /omk insights collect/);
  assert.doesNotMatch(text, /insights-prompt\.md/);
  assert.doesNotMatch(text, /--no-llm/);
});

test("insights cli exposes only prepare render paths", () =>
  withTempHomes(async (dir, env) => {
    const lines = [];
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });

    await runInsightsCli(["prepare", "--limit", "20"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /evidence pack ready/);
    assert.match(lines.at(-1), /Evidence pack:/);

    await runInsightsCli(["paths"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /evidence_pack:/);
    assert.doesNotMatch(lines.at(-1), /no-llm|collect|sections_json/);

    assert.match(await helpText(), /omk insights prepare/);
    assert.doesNotMatch(await helpText(), /--no-llm|collect|metrics-only/);
    await assert.rejects(() => runInsightsCli(["--no-llm"], { env, stdout: () => {} }), /Unknown insights option: --no-llm/);
  }));

test("doctor detects stale installed insights skill", () =>
  withTempHomes((dir, env) => {
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "Run `omk insights collect` then read insights-prompt.md", "utf8");

    const result = doctor();

    assert.equal(result.skills.insights_installed, true);
    assert.equal(result.skills.insights_current, false);
    assert.equal(result.skills.insights_stale, true);
    assert.equal(result.skill_status.insights.managed, false);
    assert.equal(result.skill_status.insights.reason, "same-name user skill without OMK marker");
  }));

test("setup force skips same-name skills without an OMK marker", () =>
  withTempHomes((dir, env) => {
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "user customized insights skill", "utf8");

    setup({ force: true });

    assert.equal(readFileSync(join(skillDir, "SKILL.md"), "utf8"), "user customized insights skill");
    assert.equal(existsSync(join(env.KIMI_USER_SKILLS_DIR, ".omk-backups")), false);
  }));

test("setup force skips OMK-managed skills after user edits", () =>
  withTempHomes((dir, env) => {
    setup();
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");
    writeFileSync(join(skillDir, "SKILL.md"), "user edited managed insights skill", "utf8");

    setup({ force: true });

    assert.equal(readFileSync(join(skillDir, "SKILL.md"), "utf8"), "user edited managed insights skill");
    assert.equal(findBackedUpSkill(env, "insights"), "");
  }));

test("setup force backs up and replaces unmodified OMK-managed skills", () =>
  withTempHomes((dir, env) => {
    setup();
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");

    setup({ force: true });

    const backupText = findBackedUpSkill(env, "insights");
    const currentText = readFileSync(join(skillDir, "SKILL.md"), "utf8");

    assert.match(backupText, /omk insights prepare/);
    assert.match(currentText, /omk insights prepare/);
    assert.equal(existsSync(join(skillDir, ".omk-managed.json")), true);
  }));

test("uninstall keeps same-name skills without an OMK marker", () =>
  withTempHomes((dir, env) => {
    setup();
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");
    rmSync(skillDir, { recursive: true, force: true });
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "user owned insights skill", "utf8");

    uninstall();

    assert.equal(readFileSync(join(skillDir, "SKILL.md"), "utf8"), "user owned insights skill");
    assert.equal(existsSync(join(env.KIMI_USER_SKILLS_DIR, ".omk-backups")), false);
  }));

test("uninstall backs up and removes edited OMK-managed skills", () =>
  withTempHomes((dir, env) => {
    setup();
    const skillDir = join(env.KIMI_USER_SKILLS_DIR, "insights");
    writeFileSync(join(skillDir, "SKILL.md"), "user edited managed insights skill", "utf8");

    uninstall();

    assert.equal(existsSync(skillDir), false);
    assert.equal(findBackedUpSkill(env, "insights"), "user edited managed insights skill");
  }));

async function helpText() {
  const lines = [];
  await runInsightsCli(["--help"], { stdout: (line) => lines.push(line) });
  return lines.join("\n");
}

function findBackedUpSkill(env, skillName) {
  const backupRoot = join(env.KIMI_USER_SKILLS_DIR, ".omk-backups");
  if (!existsSync(backupRoot)) {
    return "";
  }
  for (const batch of readdirSync(backupRoot, { withFileTypes: true })) {
    if (!batch.isDirectory()) {
      continue;
    }
    const skillPath = join(backupRoot, batch.name, skillName, "SKILL.md");
    if (existsSync(skillPath)) {
      return readFileSync(skillPath, "utf8");
    }
  }
  return "";
}
