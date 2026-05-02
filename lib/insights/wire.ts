import { existsSync, readFileSync } from "node:fs";

const INTERNAL_MARKERS = [
  "OMK_INSIGHTS_INTERNAL",
  "OMK Insights",
  "RESPOND WITH ONLY A VALID JSON OBJECT",
  "record_facets"
];

export function readWireTurns(wirePath) {
  if (!existsSync(wirePath)) {
    return [];
  }
  const turns = [];
  let current = null;
  for (const rawLine of readFileSync(wirePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "metadata" || !record.message) {
      continue;
    }
    const type = String(record.message.type || "");
    const payload = isObject(record.message.payload) ? record.message.payload : {};
    const timestamp = Number(record.timestamp) || 0;

    if (type === "TurnBegin") {
      if (current) {
        finalizeTurn(current);
        turns.push(current);
      }
      current = {
        timestamp,
        userInput: textFromValue(payload.user_input),
        events: [],
        internal: false
      };
    }

    if (!current) {
      current = {
        timestamp,
        userInput: "",
        events: [],
        internal: false
      };
    }

    current.events.push(...collectEvents(type, payload, timestamp, "root"));

    if (type === "TurnEnd") {
      finalizeTurn(current);
      turns.push(current);
      current = null;
    }
  }
  if (current) {
    finalizeTurn(current);
    turns.push(current);
  }
  return turns;
}

export function collectEvents(type, payload, timestamp, source) {
  if (type === "SubagentEvent") {
    const inner = isObject(payload.event) ? payload.event : null;
    const innerType = inner ? String(inner.type || "") : "";
    const innerPayload = inner && isObject(inner.payload) ? inner.payload : {};
    return innerType ? collectEvents(innerType, innerPayload, timestamp, "subagent") : [];
  }
  return [{ type, payload, timestamp, source }];
}

export function textFromValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(textFromValue).filter(Boolean).join(" ");
  }
  if (!isObject(value)) {
    return "";
  }
  const parts = [];
  for (const key of ["text", "think", "content", "url", "command"]) {
    if (typeof value[key] === "string") {
      parts.push(value[key]);
    }
  }
  if (isObject(value.payload)) {
    parts.push(textFromValue(value.payload));
  }
  return parts.filter(Boolean).join(" ");
}

export function isInsightsText(text) {
  const trimmed = String(text || "").trim();
  if (/^\/skill:insights(?:\s|$)/i.test(trimmed)) {
    return true;
  }
  return INTERNAL_MARKERS.some((marker) => trimmed.includes(marker));
}

function finalizeTurn(turn) {
  const texts = [turn.userInput];
  for (const event of turn.events) {
    texts.push(eventText(event));
  }
  turn.internal = texts.some(isInsightsText);
}

function eventText(event) {
  const payload = event.payload || {};
  if (event.type === "ToolCall" && isObject(payload.function)) {
    return [payload.function.name, payload.function.arguments].filter(Boolean).join(" ");
  }
  return textFromValue(payload);
}

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
