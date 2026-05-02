import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { omkUsageDataDir } from "../paths.ts";
import { INSIGHTS_SCHEMA_VERSION } from "./types.ts";

export function cacheFingerprint(session) {
  return {
    wire_mtime_ms: session.wireMtimeMs,
    wire_size: session.wireSize,
    context_mtime_ms: session.contextMtimeMs,
    context_size: session.contextSize
  };
}

export function loadCached(kind, session, env = process.env) {
  const path = cacheFile(kind, session.sessionId, env);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const cached = JSON.parse(readFileSync(path, "utf8"));
    const fingerprint = cacheFingerprint(session);
    if (cached.schema_version !== INSIGHTS_SCHEMA_VERSION) {
      return null;
    }
    for (const [key, value] of Object.entries(fingerprint)) {
      if (cached[key] !== value) {
        return null;
      }
    }
    return cached.data || null;
  } catch {
    return null;
  }
}

export function saveCached(kind, session, data, env = process.env) {
  const path = cacheFile(kind, session.sessionId, env);
  mkdirSync(dirname(path), { recursive: true });
  const body = {
    schema_version: INSIGHTS_SCHEMA_VERSION,
    ...cacheFingerprint(session),
    data
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function cacheFile(kind, sessionId, env = process.env) {
  return join(omkUsageDataDir(env), kind, `${safeName(sessionId)}.json`);
}

function safeName(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
}
