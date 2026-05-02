import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";
import assert from "node:assert/strict";
import { eventsFile, queueConditionalPrompt, readState } from "../lib/state.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const omkBin = join(packageRoot, "bin", "omk.ts");

function runHook(input) {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    return runHookIn(dir, input);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runHookIn(dir, input) {
  return spawnSync("bun", [omkBin, "hook"], {
    cwd: dir,
    env: { ...process.env, KIMI_SHARE_DIR: dir, OMK_HOME: join(dir, ".omk-home") },
    input,
    encoding: "utf8"
  });
}

test("hook ignores invalid JSON instead of failing closed", () => {
  const result = runHook("{not-json");

  assert.equal(result.status, 0);
  assert.match(result.stderr, /ignored invalid hook input/);
});

test("ralph continue prompt has no duplicated section labels", () => {
  const text = readFileSync(join(packageRoot, "prompts", "ralph", "continue.md"), "utf8");

  assert.equal((text.match(/^Source skill:/gm) || []).length, 1);
  assert.equal((text.match(/^Skill selection:/gm) || []).length, 1);
  assert.equal((text.match(/^Selected skills:/gm) || []).length, 1);
  assert.equal((text.match(/^Plan status:/gm) || []).length, 1);
  assert.equal((text.match(/^Ultrawork skill selection:/gm) || []).length, 1);
});

test("hook allows empty stdin without touching cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });

    const result = runHookIn(dir, "");

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readFileSync(join(dir, ".git", "info", "exclude"), "utf8").includes(".omk/"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook blocks obvious destructive shell commands", () => {
  const result = runHook(
    JSON.stringify({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Shell",
      tool_input: { command: "git reset --hard" }
    })
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked a destructive shell command/);
});

test("hook blocks destructive PowerShell remove item regardless of flag order", () => {
  const result = runHook(
    JSON.stringify({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Shell",
      tool_input: { command: "Remove-Item . -Force -Recurse" }
    })
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked a destructive shell command/);
});

test("hook blocks destructive Windows rmdir commands", () => {
  const result = runHook(
    JSON.stringify({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Shell",
      tool_input: { command: "rd /q /s ." }
    })
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked a destructive shell command/);
});

test("hook blocks rm -rf against absolute paths", () => {
  const result = runHook(
    JSON.stringify({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Shell",
      tool_input: { command: "rm -rf /home/user/project" }
    })
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /blocked a destructive shell command/);
});

test("hook blocks rm -rf against shell wildcards and current directories", () => {
  for (const command of ["rm -rf .", "rm -rf ..", "rm -rf *", "rm -rf ~", "rm -rf $HOME"]) {
    const result = runHook(
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Shell",
        tool_input: { command }
      })
    );

    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /blocked a destructive shell command/);
  }
});

test("hook only expands explicit ulw shorthand", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    const shorthand = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "ulw: fix tests",
        cwd: dir
      })
    );
    const ordinaryWord = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "ulwizard should stay as user text",
        cwd: dir
      })
    );

    assert.equal(shorthand.status, 0);
    assert.match(shorthand.stdout, /\/skill:ultrawork fix tests/);
    assert.equal(ordinaryWord.status, 0);
    assert.equal(ordinaryWord.stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook event log does not record prompts by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "secret sk-1234567890abcdef should not be logged",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    const log = readFileSync(eventsFile("s1", { KIMI_SHARE_DIR: dir }), "utf8");
    assert.doesNotMatch(log, /sk-1234567890abcdef|secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook keeps conditional prompts when tool success confirmation is still pending", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    queueConditionalPrompt(
      "s1",
      {
        source: "tool:SlowTool",
        prompt: "continue later",
        expectedPlanMode: true,
        requirePostSuccess: true
      },
      { KIMI_SHARE_DIR: dir }
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(readState("s1", { KIMI_SHARE_DIR: dir }).conditional_prompt.prompt, "continue later");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook does not create legacy workflow continuation from skill prompts", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    const promptResult = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "/skill:omk-review current diff"
      })
    );
    const stopResult = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop"
      })
    );

    assert.equal(promptResult.status, 0);
    assert.equal(stopResult.status, 0);
    assert.equal(stopResult.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook initializes OMK Ralph state from omk-ralph skill prompt", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "/skill:omk-ralph finish the review",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.workflow, "ralph");
    assert.equal(state.status, "active");
    assert.equal(state.task, "finish the review");
    assert.equal(state.completion_promise, "OMK_RALPH_DONE");
    assert.equal(state.iteration, 0);
    assert.equal(state.max_iterations, -1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook initializes Ralph-backed Ultrawork state from ultrawork skill prompt", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "/skill:ultrawork review the project end-to-end",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.workflow, "ralph");
    assert.equal(state.source_skill, "ultrawork");
    assert.equal(state.status, "active");
    assert.equal(state.task, "review the project end-to-end");
    assert.equal(state.completion_promise, "OMK_RALPH_DONE");
    assert.equal(state.iteration, 0);
    assert.equal(state.max_iterations, -1);
    assert.equal(state.skill_selection_status, "not_evaluated");
    assert.deepEqual(state.selected_skills, []);
    assert.equal(state.plan_required, "auto");
    assert.equal(state.plan_status, "pending");
    assert.equal(state.review_required, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook continues while OMK Ralph state is active", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "active",
        task: "finish the review",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 0,
        max_iterations: -1,
        reason: "verification still pending",
        evidence: ["bun test: not run yet"]
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /OMK Ralph is still active/);
    assert.match(result.stderr, /finish the review/);
    assert.match(result.stderr, /OMK_RALPH_DONE/);
    assert.match(result.stderr, /1 \/ unlimited/);
    assert.match(result.stderr, /bun test: not run yet/);

    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.iteration, 1);
    assert.equal(state.status, "active");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook reminds Ralph-backed Ultrawork to select skills and plan large work", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        source_skill: "ultrawork",
        status: "active",
        task: "refactor the plugin workflow",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 0,
        max_iterations: -1,
        skill_selection_status: "pending",
        selected_skills: [],
        plan_status: "pending",
        reason: "starting",
        evidence: []
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Source skill:\s+ultrawork/);
    assert.match(result.stderr, /Capability Selection Pass/);
    assert.match(result.stderr, /EnterPlanMode/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook allows Ralph-backed Ultrawork to finish without ceremonial skill selection", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        source_skill: "ultrawork",
        status: "done",
        task: "review the project",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 0,
        max_iterations: -1,
        skill_selection_status: "not_evaluated",
        reason: "task completed",
        evidence: ["claimed complete"]
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /OMK Ralph task is complete/);

    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.status, "done");
    assert.equal(state.skill_selection_status, "not_evaluated");
    assert.equal(state.end_prompt_sent, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook blocks by state without end prompt when OMK Ralph reaches max iterations", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "active",
        task: "finish the review",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 1,
        max_iterations: 1,
        reason: "verification still pending",
        evidence: []
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");

    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.status, "blocked");
    assert.equal(state.iteration, 2);
    assert.equal(state.end_prompt_sent, undefined);
    assert.match(state.reason, /max_iterations reached/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook sends end prompt once when OMK Ralph state is done", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "done",
        task: "finish the review",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 3,
        max_iterations: -1,
        reason: "verified",
        evidence: ["bun test: passed"]
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /OMK Ralph task is complete/);
    assert.match(result.stderr, /finish the review/);
    assert.match(result.stderr, /bun test: passed/);

    const state = JSON.parse(readFileSync(join(dir, ".omk", "state", "ralph-state.json"), "utf8"));
    assert.equal(state.end_prompt_sent, true);
    assert.equal(state.status, "done");

    const nextResult = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(nextResult.status, 0);
    assert.equal(nextResult.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook treats OMK Ralph terminal status case-insensitively", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "DONE",
        task: "finish the review",
        completion_promise: "OMK_RALPH_DONE",
        iteration: 1,
        max_iterations: -1,
        reason: "verified",
        evidence: []
      }),
      "utf8"
    );

    const doneResult = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(doneResult.status, 2);
    assert.match(doneResult.stderr, /OMK Ralph task is complete/);

    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "BLOCKED",
        task: "finish the review",
        reason: "needs user input",
        evidence: []
      }),
      "utf8"
    );

    const blockedResult = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(blockedResult.status, 0);
    assert.equal(blockedResult.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook allows stop when OMK Ralph state is blocked", () => {
  const dir = mkdtempSync(join(tmpdir(), "omk-hook-"));
  try {
    mkdirSync(join(dir, ".omk", "state"), { recursive: true });
    writeFileSync(
      join(dir, ".omk", "state", "ralph-state.json"),
      JSON.stringify({
        version: 1,
        workflow: "ralph",
        status: "blocked",
        task: "finish the review",
        reason: "needs user input",
        evidence: []
      }),
      "utf8"
    );

    const result = runHookIn(
      dir,
      JSON.stringify({
        session_id: "s1",
        hook_event_name: "Stop",
        cwd: dir
      })
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
