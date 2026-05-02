import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { kimiImportedSessionsDir, kimiSessionsDir, kimiShareDir } from "../paths.ts";

export function scanSessions(env = process.env) {
  const workDirByHash = readWorkDirMap(env);
  const sessions = [];
  const root = kimiSessionsDir(env);
  if (existsSync(root)) {
    for (const workDirEntry of readdirSync(root, { withFileTypes: true })) {
      if (!workDirEntry.isDirectory()) {
        continue;
      }
      const workDirHash = workDirEntry.name;
      const workDirRoot = join(root, workDirHash);
      for (const sessionEntry of readdirSync(workDirRoot, { withFileTypes: true })) {
        if (!sessionEntry.isDirectory()) {
          continue;
        }
        const session = scanSessionDir(
          join(workDirRoot, sessionEntry.name),
          workDirHash,
          workDirByHash.get(workDirHash) || "",
          false
        );
        if (session) {
          sessions.push(session);
        }
      }
    }
  }

  const importedRoot = kimiImportedSessionsDir(env);
  if (existsSync(importedRoot)) {
    for (const sessionEntry of readdirSync(importedRoot, { withFileTypes: true })) {
      if (!sessionEntry.isDirectory()) {
        continue;
      }
      const session = scanSessionDir(join(importedRoot, sessionEntry.name), "__imported__", "", true);
      if (session) {
        sessions.push(session);
      }
    }
  }

  return sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function scanSessionDir(sessionDir, workDirHash, workDir, imported) {
  const wirePath = join(sessionDir, "wire.jsonl");
  const contextPath = join(sessionDir, "context.jsonl");
  const statePath = join(sessionDir, "state.json");
  if (!existsSync(wirePath)) {
    return null;
  }

  const wireStat = statSync(wirePath);
  const contextStat = existsSync(contextPath) ? statSync(contextPath) : null;
  return {
    sessionId: sessionDir.split(/[\\/]/).pop() || "",
    workDirHash,
    workDir,
    sessionDir,
    wirePath,
    contextPath,
    statePath,
    imported,
    mtimeMs: Math.max(
      wireStat.mtimeMs,
      contextStat?.mtimeMs || 0,
      existsSync(statePath) ? statSync(statePath).mtimeMs : 0
    ),
    wireMtimeMs: wireStat.mtimeMs,
    wireSize: wireStat.size,
    contextMtimeMs: contextStat?.mtimeMs || 0,
    contextSize: contextStat?.size || 0
  };
}

function readWorkDirMap(env) {
  const map = new Map();
  const metadataPath = join(kimiShareDir(env), "kimi.json");
  if (!existsSync(metadataPath)) {
    return map;
  }
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    for (const item of Array.isArray(metadata.work_dirs) ? metadata.work_dirs : []) {
      if (!item || typeof item.path !== "string") {
        continue;
      }
      const digest = createHash("md5").update(item.path, "utf8").digest("hex");
      const kaos = typeof item.kaos === "string" ? item.kaos : "local";
      map.set(digest, item.path);
      map.set(`${kaos}_${digest}`, item.path);
    }
  } catch {
    return map;
  }
  return map;
}
