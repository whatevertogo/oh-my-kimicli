import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readKimiSessionState } from "./kimi-session.ts";
import { readConfig } from "./config.ts";
import { redactText } from "./redact.ts";
import {
  appendEvent,
  clearConditionalPrompt,
  consumeNextPrompt,
  markConditionalPromptPostSuccess,
  promoteConditionalPrompt,
  queueConditionalPrompt,
  readState
} from "./state.ts";
import { packageRoot } from "./paths.ts";

const DEFAULT_RALPH_COMPLETION_PROMISE = "OMK_RALPH_DONE";
const DEFAULT_RALPH_MAX_ITERATIONS = -1;

export async function runHook() {
  if (process.env.OMK_INSIGHTS_CHILD === "1") {
    return allow();
  }
  const input = readStdinJson();
  if (!input) {
    return allow();
  }
  const sessionId = input.session_id || "unknown";
  const eventName = input.hook_event_name || "";

  tryBestEffort("update .git/info/exclude", () => ensureOmkIgnored(input.cwd));
  tryBestEffort("record hook event", () =>
    appendEvent(sessionId, { type: "hook", event: eventName, input: summarizeInput(input) })
  );

  if (eventName === "UserPromptSubmit") {
    const replacementPrompt = normalizeUserPrompt(input);
    if (replacementPrompt) {
      initializeRalphState({ ...input, prompt: replacementPrompt });
      return allowWithReplacement(replacementPrompt);
    }
    initializeRalphState(input);
    return allow();
  }

  if (eventName === "PreToolUse") {
    queuePlanModeCandidate(sessionId, input);
    const reason = unsafeToolReason(input);
    if (reason) {
      return block(reason);
    }
    return allow();
  }

  if (eventName === "PostToolUse") {
    confirmPlanModeCandidate(sessionId, input);
    return allow();
  }

  if (eventName === "Stop") {
    const canContinue = await reconcilePlanModeCandidate(sessionId, input);
    if (!canContinue) {
      return allow();
    }
    const prompt = consumeNextPrompt(sessionId);
    if (prompt) {
      return block(prompt);
    }
    const ralphPrompt = ralphStopPrompt(input);
    if (ralphPrompt) {
      return block(ralphPrompt);
    }
    return allow();
  }

  return allow();
}

function queuePlanModeCandidate(sessionId, input) {
  const toolName = input.tool_name;
  if (toolName !== "EnterPlanMode") {
    return;
  }
  const prompt = readPrompt("plan/enter-plan-mode-next-turn.md");
  if (prompt) {
    queueConditionalPrompt(sessionId, {
      source: `tool:${toolName}`,
      prompt,
      expectedPlanMode: true,
      requirePostSuccess: false
    });
  }
}

function confirmPlanModeCandidate(sessionId, input) {
  const toolName = input.tool_name;
  if (toolName !== "EnterPlanMode") {
    return;
  }
  const output = String(input.tool_output || "");
  if (toolName === "EnterPlanMode" && /Plan mode (activated|on)/i.test(output)) {
    markConditionalPromptPostSuccess(sessionId, `tool:${toolName}`);
  }
}

async function reconcilePlanModeCandidate(sessionId, input) {
  const state = await waitForConditionalPostSuccess(sessionId);
  const candidate = state.conditional_prompt;
  if (!candidate) {
    return true;
  }

  if (candidate.require_post_success && !candidate.post_success) {
    appendEvent(sessionId, {
      type: "conditional_prompt_waiting",
      source: candidate.source,
      reason: "waiting for tool success confirmation"
    });
    return false;
  }

  const source = candidate.source;
  const kimiState = readKimiSessionState(sessionId, input.cwd);
  if (!kimiState || typeof kimiState.plan_mode !== "boolean") {
    clearConditionalPrompt(sessionId, source, "kimi session state unavailable");
    return true;
  }

  if (kimiState.plan_mode !== candidate.expected_plan_mode) {
    clearConditionalPrompt(sessionId, source, "plan mode state did not match expected value");
    return true;
  }

  promoteConditionalPrompt(sessionId, source);
  return true;
}

async function waitForConditionalPostSuccess(sessionId) {
  let state = readState(sessionId);
  const candidate = state.conditional_prompt;
  if (!candidate?.require_post_success || candidate.post_success) {
    return state;
  }
  for (let i = 0; i < 6; i += 1) {
    await sleep(50);
    state = readState(sessionId);
    if (!state.conditional_prompt?.require_post_success || state.conditional_prompt.post_success) {
      return state;
    }
  }
  return state;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryBestEffort(action, fn) {
  try {
    return fn();
  } catch (error) {
    console.error(
      `oh-my-kimicli could not ${action}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

function readPrompt(fileName) {
  const promptPath = join(packageRoot, "prompts", fileName);
  if (!existsSync(promptPath)) {
    return "";
  }
  const raw = readFileSync(promptPath, "utf8");
  return renderPrompt(stripHtmlComments(raw)).trim();
}

function renderPrompt(text) {
  return text.replace(/\{\{PLAN_TEMPLATE\}\}/g, () => readPromptPartial("plan/plan-template.md"));
}

function readPromptPartial(fileName) {
  const promptPath = join(packageRoot, "prompts", fileName);
  if (!existsSync(promptPath)) {
    return "";
  }
  return stripHtmlComments(readFileSync(promptPath, "utf8")).trim();
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function unsafeToolReason(input) {
  if (input.tool_name !== "Shell") {
    return "";
  }
  const command = String(input.tool_input?.command || "");
  if (!command) {
    return "";
  }
  const normalized = command.toLowerCase();
  const destructive = [
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-[^\n]*[xfd]/,
    /\brm\s+(?=[^\n;&|]*-[^\n;&|]*r)(?=[^\n;&|]*-[^\n;&|]*f)[^\n;&|]*\s\/\S*/i,
    /\brm\s+(?=[^\n;&|]*-[^\n;&|]*r)(?=[^\n;&|]*-[^\n;&|]*f)[^\n;&|]*(?:\s+\.|\s+\.\.|\s+\*|\s+~|\s+\$home)(?:\s|$)/i,
    /remove-item\b[\s\S]*-(?:recurse|r)\b[\s\S]*-force\b/i,
    /remove-item\b[\s\S]*-force\b[\s\S]*-(?:recurse|r)\b/i,
    /\b(?:rd|rmdir)\s+\/s\b[\s\S]*\/q\b/i,
    /\b(?:rd|rmdir)\s+\/q\b[\s\S]*\/s\b/i
  ];
  if (destructive.some((pattern) => pattern.test(normalized))) {
    return [
      "oh-my-kimicli blocked a destructive shell command.",
      `Command: ${command}`,
      "Ask the user for explicit approval before attempting this operation."
    ].join("\n");
  }
  return "";
}

function ralphStopPrompt(input) {
  const state = readRalphState(input.cwd);
  if (!state) {
    return "";
  }
  if (state.workflow !== "ralph") {
    return "";
  }
  const status = normalizeStatus(state.status);
  if (status === "done") {
    return ralphEndPrompt(input.cwd, state);
  }
  if (status === "blocked") {
    return "";
  }
  if (status !== "active") {
    return "";
  }

  const prepared = prepareRalphContinuationState(input.cwd, state);
  if (normalizeStatus(prepared.state.status) === "blocked") {
    return "";
  }

  const prompt = readPrompt("ralph/continue.md");
  if (!prompt) {
    return "";
  }
  return renderRalphPrompt(prompt, prepared.state);
}

function ralphEndPrompt(cwd, state) {
  if (state.end_prompt_sent) {
    return "";
  }
  const prompt = readPrompt("ralph/end.md");
  if (!prompt) {
    return "";
  }
  const now = new Date().toISOString();
  const endedState = {
    ...state,
    end_prompt_sent: true,
    end_prompt_sent_at: now,
    ended_at: state.ended_at || now,
    updated_at: now
  };
  writeRalphState(cwd, endedState);
  return renderRalphPrompt(prompt, endedState);
}

function initializeRalphState(input) {
  const prompt = String(input.prompt || "").trim();
  const match = /^\/skill:(omk-ralph|ultrawork)(?:\s+([\s\S]*))?$/.exec(prompt);
  if (!match || !input.cwd) {
    return;
  }
  const sourceSkill = match[1];
  const task = (match[2] || "the current user task").trim();
  const state = {
    version: 1,
    workflow: "ralph",
    source_skill: sourceSkill,
    status: "active",
    task,
    completion_promise: DEFAULT_RALPH_COMPLETION_PROMISE,
    iteration: 0,
    max_iterations: DEFAULT_RALPH_MAX_ITERATIONS,
    reason: `${sourceSkill} started`,
    evidence: [],
    updated_at: new Date().toISOString()
  };
  if (sourceSkill === "ultrawork") {
    Object.assign(state, {
      phase: "starting",
      skill_selection_status: "not_evaluated",
      selected_skills: [],
      plan_required: "auto",
      plan_status: "pending",
      review_required: true,
      evidence: ["initialized by /skill:ultrawork"]
    });
  }
  writeRalphState(input.cwd, {
    ...state
  });
}

function normalizeUserPrompt(input) {
  const prompt = String(input.prompt || "").trim();
  const match = /^ulw(?:$|[\s:：-]+([\s\S]*)?)$/i.exec(prompt);
  if (!match) {
    return "";
  }
  const task = String(match[1] || "").trim();
  return task ? `/skill:ultrawork ${task}` : "/skill:ultrawork";
}

function readRalphState(cwd) {
  if (!cwd) {
    return null;
  }
  const statePath = join(resolve(cwd), ".omk", "state", "ralph-state.json");
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {
      workflow: "ralph",
      status: "active",
      task: "",
      reason: "ralph-state.json exists but could not be parsed",
      evidence: []
    };
  }
}

function prepareRalphContinuationState(cwd, state) {
  const iteration = normalizeInteger(state.iteration, 0) + 1;
  const maxIterations = normalizeInteger(
    state.max_iterations,
    DEFAULT_RALPH_MAX_ITERATIONS
  );
  const completionPromise = String(
    state.completion_promise || DEFAULT_RALPH_COMPLETION_PROMISE
  );
  const nextState = {
    ...state,
    completion_promise: completionPromise,
    iteration,
    max_iterations: maxIterations,
    updated_at: new Date().toISOString()
  };

  if (maxIterations > 0 && iteration > maxIterations) {
    const blockedState = {
      ...nextState,
      status: "blocked",
      reason: `max_iterations reached (${iteration}/${maxIterations})`,
      evidence: [
        ...normalizeEvidence(nextState.evidence),
        `OMK Ralph: max_iterations reached (${iteration}/${maxIterations})`
      ],
      updated_at: new Date().toISOString()
    };
    writeRalphState(cwd, blockedState);
    return { state: blockedState };
  }

  writeRalphState(cwd, nextState);
  return { state: nextState };
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function writeRalphState(cwd, state) {
  const stateDir = join(resolve(cwd), ".omk", "state");
  const path = join(stateDir, "ralph-state.json");
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

function renderRalphPrompt(prompt, state) {
  return prompt
    .replace(/\{\{STATUS\}\}/g, String(state.status || "active"))
    .replace(/\{\{SOURCE_SKILL\}\}/g, String(state.source_skill || "omk-ralph"))
    .replace(/\{\{TASK\}\}/g, String(state.task || "the current user task"))
    .replace(/\{\{SKILL_SELECTION_STATUS\}\}/g, String(state.skill_selection_status || "n/a"))
    .replace(/\{\{PLAN_STATUS\}\}/g, String(state.plan_status || "n/a"))
    .replace(/\{\{SELECTED_SKILLS\}\}/g, renderSelectedSkills(state.selected_skills))
    .replace(
      /\{\{COMPLETION_PROMISE\}\}/g,
      String(state.completion_promise || DEFAULT_RALPH_COMPLETION_PROMISE)
    )
    .replace(/\{\{ITERATION\}\}/g, String(normalizeInteger(state.iteration, 0)))
    .replace(/\{\{MAX_ITERATIONS\}\}/g, renderMaxIterations(state.max_iterations))
    .replace(/\{\{REASON\}\}/g, String(state.reason || "task is still active"))
    .replace(/\{\{ENDED_AT\}\}/g, String(state.ended_at || "not ended yet"))
    .replace(/\{\{EVIDENCE\}\}/g, renderEvidence(state.evidence));
}

function renderSelectedSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return "- none recorded";
  }
  return skills
    .slice(-12)
    .map((skill) => {
      if (typeof skill === "string") {
        return `- ${trim(skill, 180)}`;
      }
      const name = trim(String(skill?.name || "unknown"), 80);
      const reason = trim(String(skill?.reason || "selected"), 180);
      return `- ${name}: ${reason}`;
    })
    .join("\n");
}

function renderEvidence(evidence) {
  const items = normalizeEvidence(evidence);
  if (items.length === 0) {
    return "- no evidence recorded yet";
  }
  const maxEvidenceItems = 8;
  const visible = items.slice(-maxEvidenceItems);
  const omitted = items.length - visible.length;
  const lines = visible.map((item) => `- ${trim(String(item), 240)}`);
  if (omitted > 0) {
    lines.unshift(`- ${omitted} older evidence item(s) omitted by hook`);
  }
  return lines.join("\n");
}

function normalizeEvidence(evidence) {
  return Array.isArray(evidence) ? evidence : [];
}

function renderMaxIterations(value) {
  const maxIterations = normalizeInteger(value, DEFAULT_RALPH_MAX_ITERATIONS);
  return maxIterations < 0 ? "unlimited" : String(maxIterations);
}

function ensureOmkIgnored(cwd) {
  const gitDir = gitAbsoluteDir(cwd);
  if (!gitDir) {
    return;
  }
  const excludePath = join(gitDir, "info", "exclude");
  mkdirSync(dirname(excludePath), { recursive: true });
  const current = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(".omk/") || lines.includes(".omk")) {
    return;
  }
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(
    excludePath,
    `${prefix}# oh-my-kimicli local state\n.omk/\n`,
    "utf8"
  );
}

function gitAbsoluteDir(cwd) {
  try {
    return execFileSync("git", ["-C", cwd || process.cwd(), "rev-parse", "--absolute-git-dir"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function summarizeInput(input) {
  const privacy = readConfig().config.privacy;
  return {
    tool_name: input.tool_name,
    agent_name: input.agent_name,
    prompt: privacy.record_hook_prompts ? redactText(trim(input.prompt, 300), privacy) : undefined,
    cwd: privacy.record_cwd ? redactText(input.cwd, privacy) : undefined
  };
}

function trim(value, max) {
  if (typeof value !== "string") {
    return value;
  }
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function readStdinJson() {
  if (process.stdin.isTTY) {
    console.error("oh-my-kimicli hook expects JSON on stdin; allowing because stdin is a TTY.");
    return null;
  }
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(
      `oh-my-kimicli ignored invalid hook input: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function allow() {
  // Hooks are synchronous by convention; setting exitCode lets Bun flush stderr before exit.
  process.exitCode = 0;
}

function allowWithReplacement(prompt) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        replacementPrompt: prompt
      }
    })}\n`
  );
  // Hooks are synchronous by convention; setting exitCode lets Bun flush stdout before exit.
  process.exitCode = 0;
}

function block(reason) {
  console.error(reason);
  // Hooks are synchronous by convention; setting exitCode lets Bun flush stderr before exit.
  process.exitCode = 2;
}
