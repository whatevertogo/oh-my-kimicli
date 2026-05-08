import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";
import assert from "node:assert/strict";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const omkBin = join(packageRoot, "bin", "omk.ts");

function runOmk(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "omk-cli-"));
  try {
    return spawnSync("bun", [omkBin, ...args], {
      cwd: dir,
      env: {
        ...process.env,
        KIMI_SHARE_DIR: join(dir, ".kimi"),
        KIMI_USER_SKILLS_DIR: join(dir, ".kimi-skills"),
        OMK_HOME: join(dir, ".omk"),
        ...env
      },
      encoding: "utf8"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("help groups commands by responsibility", () => {
  const result = runOmk(["help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Lifecycle:/);
  assert.match(result.stdout, /Project workflow:/);
  assert.match(result.stdout, /Pipelines:/);
  assert.match(result.stdout, /Helpers:/);
  assert.match(result.stdout, /omk doctor --runtime/);
  assert.match(result.stdout, /omk doctor --skills/);
});

test("doctor skills mode returns per-skill status", () => {
  const result = runOmk(["doctor", "--skills"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(typeof payload.insights.exists, "boolean");
  assert.equal(typeof payload["omk-ralph"].reason, "string");
});

test("doctor runtime mode includes dry-run hook result and plugin capabilities", () => {
  const result = runOmk(["doctor", "--runtime"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.runtime_check.ok, true);
  assert.deepEqual(payload.plugin_capabilities.hooks, [
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SubagentStop",
    "StopFailure"
  ]);
  assert.ok(payload.plugin_capabilities.skills.includes("insights"));
});
