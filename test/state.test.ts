import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	appendEvent,
	consumeNextPrompt,
	eventsFile,
	markConditionalPromptPostSuccess,
	promoteConditionalPrompt,
	queueConditionalPrompt,
	queueNextPrompt,
	readState,
	stateFile,
} from "../lib/state.ts";

function withTempShare(fn) {
	const dir = mkdtempSync(join(tmpdir(), "omk-state-"));
	const env = { KIMI_SHARE_DIR: dir };
	try {
		return fn(env);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("state paths sanitize session ids", () =>
	withTempShare((env) => {
		const file = stateFile("../bad/session", env);

		assert.match(
			file,
			/oh-my-kimicli[\\/]+sessions[\\/]+\.\._bad_session[\\/]+state\.json$/,
		);
	}));

test("next prompt is consumed once", () =>
	withTempShare((env) => {
		queueNextPrompt("s1", "continue now", "test", env);

		assert.equal(consumeNextPrompt("s1", env), "continue now");
		assert.equal(consumeNextPrompt("s1", env), "");
	}));

test("conditional prompt can be confirmed and promoted", () =>
	withTempShare((env) => {
		queueConditionalPrompt(
			"s1",
			{
				source: "tool:EnterPlanMode",
				prompt: "plan reminder",
				expectedPlanMode: true,
				requirePostSuccess: true,
			},
			env,
		);

		markConditionalPromptPostSuccess("s1", "tool:EnterPlanMode", env);
		promoteConditionalPrompt("s1", "tool:EnterPlanMode", env);

		assert.equal(consumeNextPrompt("s1", env), "plan reminder");
		assert.equal(readState("s1", env).conditional_prompt, null);
	}));

test("event logs keep only the configured number of recent lines", () =>
	withTempShare((env) => {
		const limitedEnv = { ...env, OMK_MAX_EVENT_LOG_LINES: "3" };

		appendEvent("s1", { type: "one" }, limitedEnv);
		appendEvent("s1", { type: "two" }, limitedEnv);
		appendEvent("s1", { type: "three" }, limitedEnv);
		appendEvent("s1", { type: "four" }, limitedEnv);

		const lines = readFileSync(eventsFile("s1", limitedEnv), "utf8")
			.trim()
			.split(/\r?\n/);
		assert.equal(lines.length, 3);
		assert.equal(JSON.parse(lines[0]).type, "two");
		assert.equal(JSON.parse(lines[2]).type, "four");
	}));
