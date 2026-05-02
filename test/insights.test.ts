import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import assert from "node:assert/strict";

import { generateInsightsReport } from "../lib/insights/report.ts";
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

    const report = await generateInsightsReport({ noLlm: true, env });

    assert.equal(report.scannedSessions, 1);
    assert.equal(report.analyzedSessions, 1);
    assert.equal(report.aggregated.totalUserMessages, 2);
    assert.equal(report.aggregated.languages.TypeScript, 1);
    assert.equal(report.aggregated.totalGitCommits, 1);
    assert.equal(existsSync(report.reportHtmlPath), true);
    assert.equal(existsSync(report.reportJsonPath), true);
    assert.match(readFileSync(report.reportHtmlPath, "utf8"), /oh-my-kimicli insights/);
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
  assert.match(text, /omk insights <args>/);
});
