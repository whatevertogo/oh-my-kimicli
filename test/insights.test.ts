import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "bun:test";

import { collectInsightsMessage, generateMetricsOnlyReport, insightsPaths } from "../lib/insights/report.ts";
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
  mkdirp(sessionDir);
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
  mkdirp(env.KIMI_SHARE_DIR);
  writeFileSync(
    join(env.KIMI_SHARE_DIR, "kimi.json"),
    JSON.stringify({ work_dirs: [{ path: workDir, kaos: "local" }] }),
    "utf8"
  );
  return { hash, sessionDir, wirePath };
}

function mkdirp(path) {
  mkdirSync(path, { recursive: true });
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
          tools: [{ id: "t1", name: "WriteFile", arguments: { path: "src/app.ts", content: "one\ntwo" } }]
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
    assert.equal(report.schema_version, 2);
    assert.doesNotMatch(readFileSync(report.reportHtmlPath, "utf8"), /brand-mark|prompt-card|在地平线上|Skill 机会|有趣的结尾/);
  }));

test("insights message writes manifest task and session packets", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        { user: "add feature real task one with a short request", assistant: "I will inspect files." },
        { user: "/skill:insights" },
        { user: "real task two", tools: [{ id: "t1", name: "Shell", arguments: { command: "false" }, error: "Exit Code 1" }] }
      ]
    });

    const input = await collectInsightsMessage({ env, limit: 20, facetLimit: 10 });
    const paths = insightsPaths(env);
    const task = readFileSync(paths.messagePath, "utf8");
    const payload = JSON.parse(readFileSync(paths.inputPath, "utf8"));
    const manifest = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
    const packets = readdirSync(paths.sessionsDir).filter((name) => name.endsWith(".md"));
    const packetText = readFileSync(join(paths.sessionsDir, packets[0]), "utf8");

    assert.equal(existsSync(paths.inputPath), true);
    assert.equal(existsSync(paths.messagePath), true);
    assert.equal(existsSync(paths.manifestPath), true);
    assert.equal(existsSync(paths.facetsPath), false);
    assert.equal(payload.schema_version, 2);
    assert.equal(payload.paths.facets, paths.facetsPath);
    assert.equal(payload.preferred_output_language.code, "en");
    assert.equal(payload.aggregate_metrics.workflowSignals.prompt_intents.implementation, 1);
    assert.equal(typeof payload.feature_reference.omk[0], "string");
    assert.equal(manifest.ranked_sessions.length, 1);
    assert.equal(packets.length, 1);
    assert.match(packetText, /# Session s1/);
    assert.match(packetText, /real task two/);
    assert.match(packetText, /Tool errors: 1/);
    assert.match(task, /Facets JSON Shape/);
    assert.match(task, /At a Glance.*last/s);
    assert.match(task, /Do not run `omk insights render`/);
    assert.doesNotMatch(task, /omk insights render --sections/);
    assert.doesNotMatch(JSON.stringify(payload), /TurnBegin/);
    assert.equal(input.scannedSessions, 1);
  }));

test("insights message prefers the user's Chinese language for narrative output", () =>
  withTempHomes(async (dir, env) => {
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [
        { user: "请你 review 一下这个方案，有无可以优化的地方" },
        { user: "继续修复这个问题" }
      ]
    });

    const input = await collectInsightsMessage({ env });
    const paths = insightsPaths(env);
    const payload = JSON.parse(readFileSync(paths.inputPath, "utf8"));
    const task = readFileSync(paths.messagePath, "utf8");

    assert.equal(input.preferred_output_language.code, "zh");
    assert.equal(payload.preferred_output_language.code, "zh");
    assert.match(task, /你是当前 KimiCLI agent/);
    assert.match(task, /中文用户优先使用自然中文正文/);
    assert.equal(payload.ranked_sessions[0].workflow_tags.includes("review"), true);
  }));

test("insights turn filtering keeps other turns in the same session", () =>
  withTempHomes((dir, env) => {
    const { wirePath } = writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "real task one" }, { user: "/skill:insights --no-llm" }, { user: "real task two" }]
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

test("insights skill frontmatter is discoverable and uses v2 workflow", () => {
  const text = readFileSync(join(import.meta.dir, "..", "skills", "insights", "SKILL.md"), "utf8");

  assert.match(text, /^---\nname: insights\n/m);
  assert.match(text, /omk insights message/);
  assert.match(text, /manifest\.json/);
  assert.match(text, /session packet files/);
  assert.match(text, /insights-facets\.json/);
  assert.match(text, /At a Glance was written after the other sections/);
  assert.match(text, /Do not manufacture recommendations/);
  assert.match(text, /only when the report has a concrete skill opportunity/);
  assert.doesNotMatch(text, /omk insights render --sections/);
  assert.doesNotMatch(text, /kimi --print`\s*$/m);
});

test("insights cli supports message paths and metrics commands only", () =>
  withTempHomes(async (dir, env) => {
    const lines = [];
    writeSession(env, {
      workDir: join(dir, "project"),
      sessionId: "s1",
      turns: [{ user: "build report" }, { user: "verify report" }]
    });

    await runInsightsCli(["message", "--limit", "20"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /insights message complete/);
    assert.match(lines.at(-1), /Manifest:/);
    assert.match(lines.at(-1), /Session packets:/);

    await runInsightsCli(["paths"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /manifest:/);
    assert.doesNotMatch(lines.at(-1), /render_command:/);

    await runInsightsCli(["--no-llm"], { env, stdout: (line) => lines.push(line) });
    assert.match(lines.at(-1), /metrics report complete/);

    await assert.rejects(() => runInsightsCli(["render"], { env, stdout: () => {} }), /Unknown insights command: render/);
    await assert.rejects(() => runInsightsCli(["collect"], { env, stdout: () => {} }), /Unknown insights command: collect/);
  }));
