import { textFromValue } from "./wire.ts";

export function buildTranscript(session, turns, meta) {
  const lines = [
    `Session: ${session.sessionId}`,
    `Project: ${session.workDir || session.workDirHash}`,
    `Started: ${meta.startTime}`,
    `Duration minutes: ${meta.durationMinutes.toFixed(1)}`,
    ""
  ];

  for (const turn of turns.filter((item) => !item.internal)) {
    if (turn.userInput) {
      lines.push(`User: ${trim(turn.userInput, 500)}`);
    }
    for (const event of turn.events) {
      if (event.source === "subagent" && event.type === "TurnBegin") {
        lines.push(`[Subagent turn: ${trim(textFromValue(event.payload.user_input), 180)}]`);
      } else if (event.type === "TextPart") {
        const text = trim(textFromValue(event.payload), 300);
        if (text) {
          lines.push(`Assistant: ${text}`);
        }
      } else if (event.type === "ToolCall") {
        const fn = event.payload.function || {};
        lines.push(`[Tool: ${fn.name || "unknown"}]`);
      } else if (event.type === "ToolResult") {
        const rv = event.payload.return_value || {};
        if (rv.is_error) {
          lines.push(`[Tool error: ${trim(textFromValue(rv), 220)}]`);
        }
      } else if (event.type === "StepInterrupted") {
        lines.push("[Interrupted]");
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function trim(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
