import { test } from "bun:test";
import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG, ensureConfig, readConfig } from "../lib/config.ts";
import { omkConfigFile, omkHomeDir } from "../lib/paths.ts";

function withTempOmkHome(fn) {
	const dir = mkdtempSync(join(tmpdir(), "omk-config-"));
	const env = { OMK_HOME: dir };
	try {
		return fn(env);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("config path defaults to OMK_HOME config json when provided", () =>
	withTempOmkHome((env) => {
		assert.equal(omkHomeDir(env), env.OMK_HOME);
		assert.equal(omkConfigFile(env), join(env.OMK_HOME, "config.json"));
	}));

test("missing config reads as default without writing", () =>
	withTempOmkHome((env) => {
		const result = readConfig(env);

		assert.equal(result.exists, false);
		assert.equal(result.valid, true);
		assert.equal(result.config.features.pet, false);
		assert.equal(existsSync(result.path), false);
	}));

test("ensure config creates default config", () =>
	withTempOmkHome((env) => {
		const result = ensureConfig(env);

		assert.equal(result.exists, true);
		assert.equal(result.valid, true);
		assert.equal(result.config.features.pet, false);
		assert.deepEqual(
			JSON.parse(readFileSync(result.path, "utf8")),
			DEFAULT_CONFIG,
		);
	}));

test("config preserves explicit pet setting and defaults unknown fields", () =>
	withTempOmkHome((env) => {
		const path = omkConfigFile(env);
		writeFileSync(path, JSON.stringify({ features: { pet: true } }), "utf8");

		const result = readConfig(env);

		assert.equal(result.exists, true);
		assert.equal(result.valid, true);
		assert.equal(result.config.version, 1);
		assert.equal(result.config.features.pet, true);
	}));

test("invalid config falls back to defaults without throwing", () =>
	withTempOmkHome((env) => {
		const path = omkConfigFile(env);
		writeFileSync(path, "{bad-json", "utf8");

		const result = readConfig(env);

		assert.equal(result.exists, true);
		assert.equal(result.valid, false);
		assert.equal(result.config.features.pet, false);
		assert.match(result.error, /JSON/);
	}));
