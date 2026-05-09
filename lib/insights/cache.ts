import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { omkUsageDataDir } from "../paths.ts";
import { INSIGHTS_SCHEMA_VERSION } from "./types.ts";

const CACHE_KINDS = ["session-meta", "facets"];
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_FILES_PER_KIND = 500;

export function cacheFingerprint(session) {
	return {
		wire_mtime_ms: session.wireMtimeMs,
		wire_size: session.wireSize,
		context_mtime_ms: session.contextMtimeMs,
		context_size: session.contextSize,
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
		data,
	};
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

export function cleanCache(env = process.env) {
	let removed = 0;
	for (const kind of CACHE_KINDS) {
		const dir = join(omkUsageDataDir(env), kind);
		if (!existsSync(dir)) {
			continue;
		}
		const now = Date.now();
		const entries = [];
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			try {
				const stat = statSync(path);
				entries.push({ path, mtimeMs: stat.mtimeMs });
			} catch {
				continue;
			}
		}

		for (const entry of entries) {
			if (now - entry.mtimeMs > MAX_CACHE_AGE_MS) {
				try {
					rmSync(entry.path, { force: true });
					removed++;
				} catch {
					continue;
				}
			}
		}

		if (entries.length > MAX_CACHE_FILES_PER_KIND) {
			const remaining = entries
				.filter((e) => existsSync(e.path))
				.sort((a, b) => b.mtimeMs - a.mtimeMs);
			for (let i = MAX_CACHE_FILES_PER_KIND; i < remaining.length; i++) {
				try {
					rmSync(remaining[i].path, { force: true });
					removed++;
				} catch {
					continue;
				}
			}
		}
	}
	return removed;
}

export function cacheFile(kind, sessionId, env = process.env) {
	return join(omkUsageDataDir(env), kind, `${safeName(sessionId)}.json`);
}

function safeName(value) {
	return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
}
