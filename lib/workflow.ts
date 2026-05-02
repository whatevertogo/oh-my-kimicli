import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function workflowStatus({ cwd = process.cwd() } = {}) {
  const path = ralphStatePath(cwd);
  if (!existsSync(path)) {
    return { exists: false, path };
  }
  return { exists: true, path, state: readJson(path) };
}

export function cancelWorkflow({ cwd = process.cwd(), reason = "cancelled by user via omk cancel" } = {}) {
  const current = workflowStatus({ cwd });
  const state = {
    ...(current.state || {}),
    version: current.state?.version || 1,
    workflow: "ralph",
    status: "blocked",
    reason,
    evidence: [...normalizeEvidence(current.state?.evidence), "user cancelled continuation"],
    updated_at: new Date().toISOString()
  };
  writeRalphState(cwd, state);
  return { path: ralphStatePath(cwd), state };
}

export function resumeWorkflow({ cwd = process.cwd(), reason = "resumed by user via omk resume" } = {}) {
  const current = workflowStatus({ cwd });
  const state = {
    ...(current.state || {}),
    version: current.state?.version || 1,
    workflow: "ralph",
    status: "active",
    reason,
    evidence: [...normalizeEvidence(current.state?.evidence), "user resumed continuation"],
    updated_at: new Date().toISOString()
  };
  writeRalphState(cwd, state);
  return { path: ralphStatePath(cwd), state };
}

export function cleanWorkflow({ cwd = process.cwd() } = {}) {
  const dir = join(resolve(cwd), ".omk", "state");
  rmSync(dir, { recursive: true, force: true });
  return { removed: dir };
}

export function formatWorkflowStatus(result) {
  if (!result.exists) {
    return `No OMK workflow state found.\nPath: ${result.path}`;
  }
  const state = result.state || {};
  const max = Number(state.max_iterations);
  return [
    `Workflow: ${state.workflow || "unknown"}`,
    `Source skill: ${state.source_skill || "n/a"}`,
    `Status: ${state.status || "unknown"}`,
    `Task: ${state.task || "n/a"}`,
    `Iteration: ${Number(state.iteration || 0)} / ${Number.isInteger(max) && max >= 0 ? max : "unlimited"}`,
    `Reason: ${state.reason || "n/a"}`,
    "",
    "Evidence:",
    ...normalizeEvidence(state.evidence).map((item) => `- ${item}`)
  ].join("\n");
}

function ralphStatePath(cwd) {
  return join(resolve(cwd), ".omk", "state", "ralph-state.json");
}

function writeRalphState(cwd, state) {
  const path = ralphStatePath(cwd);
  mkdirSync(join(resolve(cwd), ".omk", "state"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { workflow: "ralph", status: "active", reason: "state file could not be parsed" };
  }
}

function normalizeEvidence(value) {
  return Array.isArray(value) ? value : [];
}
