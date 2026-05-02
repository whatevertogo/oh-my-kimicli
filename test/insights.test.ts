import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import assert from "node:assert/strict";

import {
  collectInsightsInput,
  generateMetricsOnlyReport,
  insightsPaths,
  renderInsightsReport
} from "../lib/insights/report.ts";
import { runInsightsCli } from "../lib/insights/cli.ts";
import { scanSessions } from "../lib/insights/scan.ts";
import { buildSessionMeta } from "../lib/insights/meta.ts";
import { readWireTurns } from "../lib/insights/wire.ts";

async function withTempHomes(fn) {
  const dir = mkdtempSync(join(tmpdir(), "omk-insights-"));
  const env = {
    ...process.env,
    KIMI_SHARE_DIR: join(dir, ".kimi"),
    OMK_HOME: join(dir, ".omk")
  };
  try {
    return await fn(dir, env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

test("insights no-llm report is generated from Kimi sessions", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        {
          user: "add feature",
          tools: [
            {
              id: "t1",
              name: "WriteFile",
              arguments: { path: "src/app.ts", content: "one\ntwo" }
            }
          ]
        },
        { user: "run tests", tools: [{ id: "t2", name: "Shell", arguments: { command: "git commit -m x" } }] }
      ]
    });

    const report = await generateMetricsOnlyReport({ noLlm: true, env });

    assert.equal(report.scannedSessions, 1);
    assert.equal(report.analyzedSessions, 1);
    assert.equal(report.aggregated.totalUserMessages, 2);
    assert.equal(report.aggregated.languages.TypeScript, 1);
    assert.equal(report.aggregated.totalGitCommits, 1);
    assert.equal(existsSync(report.reportHtmlPath), true);
    assert.equal(existsSync(report.reportJsonPath), true);
    assert.match(readFileSync(report.reportHtmlPath, "utf8"), /oh-my-kimicli insights/);
    assert.equal(report.mode, "metrics-only");
  }));

test("insights collect writes bounded input prompt and draft", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        { user: "add feature real task one with a short request" },
        { user: "/skill:insights" },
        { user: "real task two", tools: [{ id: "t1", name: "Shell", arguments: { command: "false" }, error: "Exit Code 1" }] }
      ]
    });

    const input = await collectInsightsInput({ env, limit: 20, facetLimit: 10 });
    const paths = insightsPaths(env);
    const prompt = readFileSync(paths.promptPath, "utf8");
    const payload = JSON.parse(readFileSync(paths.inputPath, "utf8"));

    assert.equal(existsSync(paths.inputPath), true);
    assert.equal(existsSync(paths.promptPath), true);
    assert.equal(existsSync(paths.draftHtmlPath), true);
    assert.equal(payload.schema_version, 1);
    assert.equal(payload.render.sections_path, paths.sectionsPath);
    assert.equal(payload.preferred_output_language.code, "en");
    assert.equal(payload.workflow_signals.prompt_intents.implementation, 1);
    assert.equal(typeof payload.recommendation_context.omk[0], "string");
    assert.match(prompt, /Required JSON Schema/);
    assert.match(prompt, /Write the narrative sections in natural English/);
    assert.match(prompt, /skill_opportunities/);
    assert.match(prompt, /Write every section in the required JSON object/);
    assert.match(prompt, /omk insights render --sections/);
    assert.equal(payload.session_summaries.length, 1);
    assert.equal(payload.session_summaries[0].user_messages, 2);
    assert.doesNotMatch(JSON.stringify(payload), /TurnBegin/);
    assert.equal(input.scannedSessions, 1);
  }));

test("insights collect prefers the user's Chinese language for narrative output", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        { user: "请你 review 一下这个方案，有无可以优化的地方" },
        { user: "继续修复这个问题" }
      ]
    });

    const input = await collectInsightsInput({ env });
    const paths = insightsPaths(env);
    const payload = JSON.parse(readFileSync(paths.inputPath, "utf8"));
    const prompt = readFileSync(paths.promptPath, "utf8");

    assert.equal(input.preferred_output_language.code, "zh");
    assert.equal(payload.preferred_output_language.code, "zh");
    assert.match(prompt, /natural Simplified Chinese/);
    assert.equal(payload.session_summaries[0].prompt_language, "mixed Chinese-English");
    assert.equal(payload.session_summaries[0].workflow_tags.includes("review"), true);
  }));

test("insights render consumes agent sections and writes final report", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });
    await collectInsightsInput({ env });
    const paths = insightsPaths(env);
    writeFileSync(
      paths.sectionsPath,
      JSON.stringify({
        schema_version: 1,
        at_a_glance: {
          whats_working: "<strong>escaped</strong>",
          whats_hindering: "Few issues",
          quick_wins: "Use skills",
          ambitious_workflows: "Use Ralph"
        },
        project_areas: { areas: [{ name: "Project", session_count: 1, description: "Work area" }] },
        interaction_style: { narrative: "Direct", key_pattern: "Iterative" },
        what_works: { intro: "Good", impressive_workflows: [{ title: "Review", description: "Works" }] },
        friction_analysis: { intro: "Low", categories: [] },
        suggestions: { kimi_instructions_additions: [], features_to_try: [], usage_patterns: [] },
        skill_opportunities: [
          {
            name: "review discipline",
            trigger: "after code changes",
            why: "Repeated review work should be reusable.",
            evidence: ["review sessions appeared"],
            proposed_scope: "Update omk-review guidance.",
            risk: "Could be too broad.",
            example_prompt: "/skill:omk-review",
            recommended_action: "update_skill"
          }
        ],
        on_the_horizon: { intro: "More", opportunities: [] },
        fun_ending: { headline: "Done", detail: "Clean" }
      }),
      "utf8"
    );

    const report = await renderInsightsReport({ env, sectionsPath: paths.sectionsPath });
    const html = readFileSync(report.reportHtmlPath, "utf8");
    const json = JSON.parse(readFileSync(report.reportJsonPath, "utf8"));

    assert.equal(report.mode, "narrative");
    assert.equal(json.sections.fun_ending.headline, "Done");
    assert.equal(json.sections.skill_opportunities[0].recommended_action, "update_skill");
    assert.match(html, /&lt;strong&gt;escaped&lt;\/strong&gt;/);
    assert.match(html, /Skill Opportunities/);
    assert.match(html, /review discipline/);
  }));

test("insights render rejects non-json sections with a clear error", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });
    await collectInsightsInput({ env });
    const paths = insightsPaths(env);
    writeFileSync(paths.sectionsPath, "not-json", "utf8");

    await assert.rejects(() => renderInsightsReport({ env, sectionsPath: paths.sectionsPath }), /Invalid insights sections JSON/);
  }));

test("insights turn filtering keeps other turns in the same session", () =>
  withTempHomes((dir, env) => {
    const { wirePath } = writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        { user: "real task one" },
        { user: "/skill:insights --no-llm" },
        { user: "real task two" }
      ]
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

test("insights skill frontmatter is discoverable", () => {
  const text = readFileSync(join(import.meta.dir, "..", "skills", "insights", "SKILL.md"), "utf8");

  assert.match(text, /^---\nname: insights\n/m);
  assert.match(text, /omk insights collect/);
  assert.match(text, /omk insights render --sections/);
  assert.match(text, /skill_opportunities/);
  assert.match(text, /Ask first/);
  assert.doesNotMatch(text, /kimi --print`\s*$/m);
});

test("insights cli supports collect render paths and metrics commands", () =>
  withTempHomes(async (dir, env) => {
    const lines = [];
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });

    await runInsightsCli(["collect", "--limit", "20"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /insights collect complete/);

    const paths = insightsPaths(env);
    writeFileSync(paths.sectionsPath, JSON.stringify({ schema_version: 1 }), "utf8");
    await runInsightsCli(["render", "--sections", paths.sectionsPath], {
      env,
      stdout: (line) => lines.push(line)
    });
    assert.match(lines.at(-1), /insights render complete/);

    await runInsightsCli(["paths"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /render_command:/);

    await runInsightsCli(["--no-llm"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /metrics report complete/);
  }));
