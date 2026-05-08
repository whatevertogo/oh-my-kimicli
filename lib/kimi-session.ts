import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir } from "./paths.ts";

export function readKimiSessionState(sessionId, cwd, env = process.env) {
	for (const candidate of sessionStateCandidates(sessionId, cwd, env)) {
		try {
			if (existsSync(candidate)) {
				return JSON.parse(readFileSync(candidate, "utf8"));
			}
		} catch {
			// Try the next candidate. Hooks must not fail closed on unreadable state.
		}
	}
	return null;
}

function sessionStateCandidates(sessionId, cwd, env) {
	const share = kimiShareDir(env);
	const candidates = [];
	const fromMetadata = findFromMetadata(share, sessionId, cwd);
	if (fromMetadata) {
		candidates.push(fromMetadata);
	}
	if (cwd) {
		candidates.push(join(share, "sessions", md5(cwd), sessionId, "state.json"));
	}
	candidates.push(...findBySessionId(share, sessionId));
	return dedupe(candidates);
}

function findFromMetadata(share, sessionId, cwd) {
	if (!cwd) {
		return null;
	}
	try {
		const metadata = JSON.parse(readFileSync(join(share, "kimi.json"), "utf8"));
		const workDirs = Array.isArray(metadata.work_dirs)
			? metadata.work_dirs
			: [];
		const match = workDirs.find((item) => item && item.path === cwd);
		if (!match) {
			return null;
		}
		const kaos = match.kaos || "local";
		const base =
			kaos === "local" ? md5(match.path) : `${kaos}_${md5(match.path)}`;
		return join(share, "sessions", base, sessionId, "state.json");
	} catch {
		return null;
	}
}

function findBySessionId(share, sessionId) {
	const sessionsRoot = join(share, "sessions");
	try {
		return readdirSync(sessionsRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(sessionsRoot, entry.name, sessionId, "state.json"));
	} catch {
		return [];
	}
}

function md5(value) {
	return createHash("md5").update(String(value), "utf8").digest("hex");
}

function dedupe(values) {
	return [...new Set(values)];
}
