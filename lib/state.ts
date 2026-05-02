import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omkSessionsDir } from "./paths.ts";

const DEFAULT_MAX_EVENT_LOG_LINES = 10000;

export function sessionDir(sessionId, env = process.env) {
  const safe = sanitizeId(sessionId || "unknown");
  return join(omkSessionsDir(env), safe);
}

export function stateFile(sessionId, env = process.env) {
  return join(sessionDir(sessionId, env), "state.json");
}

export function eventsFile(sessionId, env = process.env) {
  return join(sessionDir(sessionId, env), "events.jsonl");
}

export function readState(sessionId, env = process.env) {
  try {
    return JSON.parse(readFileSync(stateFile(sessionId, env), "utf8"));
  } catch {
    return {
      version: 1,
      session_id: sessionId || "unknown",
      active: null,
      events: 0
    };
  }
}

export function writeState(sessionId, state, env = process.env) {
  mkdirSync(sessionDir(sessionId, env), { recursive: true });
  atomicWriteJson(stateFile(sessionId, env), state);
}

export function appendEvent(sessionId, event, env = process.env) {
  const state = readState(sessionId, env);
  state.events = (state.events || 0) + 1;
  state.updated_at = new Date().toISOString();
  writeState(sessionId, state, env);
  mkdirSync(sessionDir(sessionId, env), { recursive: true });
  writeFileSync(
    eventsFile(sessionId, env),
    `${JSON.stringify({ at: state.updated_at, ...event })}\n`,
    { encoding: "utf8", flag: "a", mode: 0o600 }
  );
  const maxLines = maxEventLogLines(env);
  if (state.events % 100 === 0 || state.events > maxLines) {
    trimEventLog(eventsFile(sessionId, env), maxLines);
  }
}

export function consumeNextPrompt(sessionId, env = process.env) {
  const state = readState(sessionId, env);
  if (state.next_prompt?.prompt) {
    const prompt = state.next_prompt.prompt;
    const source = state.next_prompt.source || "unknown";
    state.next_prompt = null;
    state.updated_at = new Date().toISOString();
    writeState(sessionId, state, env);
    appendEvent(sessionId, { type: "next_prompt_consumed", source }, env);
    return prompt;
  }
  return "";
}

export function queueNextPrompt(sessionId, prompt, source, env = process.env) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    return readState(sessionId, env);
  }
  const state = readState(sessionId, env);
  state.next_prompt = {
    source,
    prompt: cleanPrompt,
    queued_at: new Date().toISOString()
  };
  state.updated_at = state.next_prompt.queued_at;
  writeState(sessionId, state, env);
  appendEvent(sessionId, { type: "next_prompt_queued", source }, env);
  return state;
}

export function queueConditionalPrompt(
  sessionId,
  { prompt, source, expectedPlanMode, requirePostSuccess = false },
  env = process.env
) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    return readState(sessionId, env);
  }
  const state = readState(sessionId, env);
  state.conditional_prompt = {
    source,
    prompt: cleanPrompt,
    expected_plan_mode: expectedPlanMode,
    require_post_success: requirePostSuccess,
    post_success: false,
    queued_at: new Date().toISOString()
  };
  state.updated_at = state.conditional_prompt.queued_at;
  writeState(sessionId, state, env);
  appendEvent(
    sessionId,
    {
      type: "conditional_prompt_queued",
      source,
      expected_plan_mode: expectedPlanMode,
      require_post_success: requirePostSuccess
    },
    env
  );
  return state;
}

export function markConditionalPromptPostSuccess(sessionId, source, env = process.env) {
  const state = readState(sessionId, env);
  if (!state.conditional_prompt || state.conditional_prompt.source !== source) {
    return state;
  }
  state.conditional_prompt.post_success = true;
  state.conditional_prompt.post_success_at = new Date().toISOString();
  state.updated_at = state.conditional_prompt.post_success_at;
  writeState(sessionId, state, env);
  appendEvent(sessionId, { type: "conditional_prompt_confirmed", source }, env);
  return state;
}

export function promoteConditionalPrompt(sessionId, source, env = process.env) {
  const state = readState(sessionId, env);
  if (!state.conditional_prompt || state.conditional_prompt.source !== source) {
    return state;
  }
  const queuedAt = new Date().toISOString();
  state.next_prompt = {
    source,
    prompt: state.conditional_prompt.prompt,
    queued_at: queuedAt
  };
  state.conditional_prompt = null;
  state.updated_at = queuedAt;
  writeState(sessionId, state, env);
  appendEvent(sessionId, { type: "conditional_prompt_promoted", source }, env);
  return state;
}

export function clearConditionalPrompt(sessionId, source, reason, env = process.env) {
  const state = readState(sessionId, env);
  if (!state.conditional_prompt || state.conditional_prompt.source !== source) {
    return state;
  }
  state.conditional_prompt = null;
  state.updated_at = new Date().toISOString();
  writeState(sessionId, state, env);
  appendEvent(sessionId, { type: "conditional_prompt_cleared", source, reason }, env);
  return state;
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function maxEventLogLines(env) {
  const value = Number(env.OMK_MAX_EVENT_LOG_LINES);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_EVENT_LOG_LINES;
}

function trimEventLog(file, maxLines) {
  try {
    const lines = readFileSync(file, "utf8").trimEnd().split(/\r?\n/);
    if (lines.length <= maxLines) {
      return;
    }
    writeFileSync(file, `${lines.slice(-maxLines).join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  } catch {
    // Event logs are diagnostic only; never fail the hook because rotation failed.
  }
}

function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
}
