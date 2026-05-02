import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import assert from "node:assert/strict";

import { cancelWorkflow, cleanWorkflow, resumeWorkflow, workflowStatus } from "../lib/workflow.ts";

function withTempProject(fn) {
  const dir = mkdtempSync(join(tmpdir(), "omk-workflow-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("workflow status reports missing Ralph state", () =>
  withTempProject((cwd) => {
    const status = workflowStatus({ cwd });

    assert.equal(status.exists, false);
    assert.match(status.path, /ralph-state\.json$/);
  }));

test("cancel and resume update project-local Ralph state", () =>
  withTempProject((cwd) => {
    const statePath = join(cwd, ".omk", "state", "ralph-state.json");

    cancelWorkflow({ cwd });
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).status, "blocked");

    resumeWorkflow({ cwd });
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.status, "active");
    assert.match(state.evidence.join("\n"), /user resumed continuation/);
  }));

test("clean removes project-local workflow state", () =>
  withTempProject((cwd) => {
    const statePath = join(cwd, ".omk", "state", "ralph-state.json");
    cancelWorkflow({ cwd });
    writeFileSync(statePath, readFileSync(statePath, "utf8"), "utf8");

    cleanWorkflow({ cwd });

    assert.equal(existsSync(statePath), false);
  }));
