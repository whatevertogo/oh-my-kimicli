import { extname } from "node:path";
import { INSIGHTS_SCHEMA_VERSION } from "./types.ts";
import { isObject, textFromValue } from "./wire.ts";

const EXTENSION_TO_LANGUAGE = {
	".ts": "TypeScript",
	".tsx": "TypeScript",
	".js": "JavaScript",
	".jsx": "JavaScript",
	".py": "Python",
	".rs": "Rust",
	".go": "Go",
	".java": "Java",
	".kt": "Kotlin",
	".cs": "C#",
	".cpp": "C++",
	".c": "C",
	".h": "C/C++",
	".hpp": "C++",
	".rb": "Ruby",
	".php": "PHP",
	".swift": "Swift",
	".md": "Markdown",
	".json": "JSON",
	".toml": "TOML",
	".yaml": "YAML",
	".yml": "YAML",
	".html": "HTML",
	".css": "CSS",
	".scss": "SCSS",
	".sql": "SQL",
	".sh": "Shell",
	".ps1": "PowerShell",
};

export function buildSessionMeta(session, turns) {
	const visibleTurns = turns.filter((turn) => !turn.internal);
	const allEvents = visibleTurns.flatMap((turn) => turn.events);
	const allTimestamps = allEvents
		.map((event) => event.timestamp)
		.filter(Boolean);
	const start = allTimestamps.length
		? Math.min(...allTimestamps)
		: session.wireMtimeMs / 1000;
	const end = allTimestamps.length ? Math.max(...allTimestamps) : start;
	const pendingTools = new Map();
	const filesModified = new Set();
	const languages = {};
	const toolCounts = {};
	const toolErrorCategories = {};
	const userMessageTimestamps = [];
	const messageHours = [];
	const userResponseTimes = [];
	let lastAssistantTimestamp = 0;
	let userMessageCount = 0;
	let assistantStepCount = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;
	let toolErrorCount = 0;
	let linesAdded = 0;
	let linesRemoved = 0;
	let gitCommits = 0;
	let gitPushes = 0;
	let usesSubagent = turns.some((turn) =>
		turn.events.some((event) => event.source === "subagent"),
	);
	let usesMcp = false;
	let usesWeb = false;
	let userInterruptions = 0;
	let firstPrompt = "";

	for (const turn of visibleTurns) {
		if (!firstPrompt && turn.userInput) {
			firstPrompt = turn.userInput;
		}
		for (const event of turn.events) {
			if (event.type === "TurnBegin" && event.source === "root") {
				const text = textFromValue(event.payload.user_input);
				if (text) {
					userMessageCount += 1;
					recordUserTime(event.timestamp);
				}
			} else if (event.type === "SteerInput" && event.source === "root") {
				const text = textFromValue(event.payload.user_input);
				if (text) {
					userMessageCount += 1;
					recordUserTime(event.timestamp);
				}
			} else if (event.type === "StepBegin" && event.source === "root") {
				assistantStepCount += 1;
				lastAssistantTimestamp = event.timestamp;
			} else if (event.type === "StepInterrupted") {
				userInterruptions += 1;
			} else if (event.type === "ToolCall") {
				const fn = isObject(event.payload.function)
					? event.payload.function
					: {};
				const name = String(fn.name || "unknown");
				toolCounts[name] = (toolCounts[name] || 0) + 1;
				if (String(event.payload.id || "")) {
					pendingTools.set(String(event.payload.id), name);
				}
				if (/^mcp__/i.test(name)) {
					usesMcp = true;
				}
				if (/web|search|fetch/i.test(name)) {
					usesWeb = true;
				}
				if (/agent/i.test(name)) {
					usesSubagent = true;
				}
				const args = parseToolArgs(fn.arguments);
				for (const file of extractFiles(args)) {
					filesModified.add(file);
					const language = languageForPath(file);
					if (language) {
						languages[language] = (languages[language] || 0) + 1;
					}
				}
				const diff = estimateLineDiff(args);
				linesAdded += diff.added;
				linesRemoved += diff.removed;
				const command = String(args.command || "");
				if (/\bgit\s+commit\b/.test(command)) {
					gitCommits += 1;
				}
				if (/\bgit\s+push\b/.test(command)) {
					gitPushes += 1;
				}
			} else if (event.type === "ToolResult") {
				const id = String(event.payload.tool_call_id || "");
				const rv = isObject(event.payload.return_value)
					? event.payload.return_value
					: {};
				if (rv.is_error) {
					toolErrorCount += 1;
					const category = categorizeToolError(textFromValue(rv));
					toolErrorCategories[category] =
						(toolErrorCategories[category] || 0) + 1;
				}
				pendingTools.delete(id);
				lastAssistantTimestamp = event.timestamp;
			} else if (
				event.type === "ApprovalResponse" &&
				event.payload.response === "reject"
			) {
				toolErrorCount += 1;
				toolErrorCategories["User Rejected"] =
					(toolErrorCategories["User Rejected"] || 0) + 1;
			} else if (event.type === "StatusUpdate") {
				const usage = isObject(event.payload.token_usage)
					? event.payload.token_usage
					: {};
				inputTokens += toNumber(usage.input_other);
				outputTokens += toNumber(usage.output);
				cacheReadTokens += toNumber(usage.input_cache_read);
				cacheCreationTokens += toNumber(usage.input_cache_creation);
			}
		}
	}

	return {
		schemaVersion: INSIGHTS_SCHEMA_VERSION,
		sessionId: session.sessionId,
		projectHash: session.workDirHash,
		projectPath: session.workDir || session.workDirHash,
		startTime: new Date(start * 1000).toISOString(),
		endTime: new Date(end * 1000).toISOString(),
		durationMinutes: Math.max(0, (end - start) / 60),
		firstPrompt,
		userMessageCount,
		assistantStepCount,
		toolCounts,
		toolErrorCount,
		toolErrorCategories,
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheCreationTokens,
		filesModified: Array.from(filesModified).sort(),
		languages,
		linesAdded,
		linesRemoved,
		gitCommits,
		gitPushes,
		usesSubagent,
		usesMcp,
		usesWeb,
		userInterruptions,
		userResponseTimes,
		messageHours,
		userMessageTimestamps,
		isMetaSession: turns.length > 0 && visibleTurns.length === 0,
	};

	function recordUserTime(timestamp) {
		if (!timestamp) {
			return;
		}
		const date = new Date(timestamp * 1000);
		messageHours.push(date.getHours());
		userMessageTimestamps.push(date.toISOString());
		if (lastAssistantTimestamp) {
			const delta = timestamp - lastAssistantTimestamp;
			if (delta >= 2 && delta <= 3600) {
				userResponseTimes.push(delta);
			}
		}
	}
}

function parseToolArgs(value) {
	if (isObject(value)) {
		return value;
	}
	if (typeof value !== "string" || !value.trim()) {
		return {};
	}
	try {
		const parsed = JSON.parse(value);
		return isObject(parsed) ? parsed : {};
	} catch {
		return { command: value };
	}
}

function extractFiles(args) {
	const files = [];
	for (const key of ["path", "file_path", "filepath", "new_path", "old_path"]) {
		if (typeof args[key] === "string") {
			files.push(args[key]);
		}
	}
	if (Array.isArray(args.edits)) {
		for (const edit of args.edits) {
			if (isObject(edit) && typeof edit.path === "string") {
				files.push(edit.path);
			}
		}
	}
	return files;
}

function estimateLineDiff(args) {
	const oldText = String(args.old_str || args.old_string || args.oldText || "");
	const newText = String(
		args.new_str || args.new_string || args.newText || args.content || "",
	);
	return {
		added: newText ? countLines(newText) : 0,
		removed: oldText ? countLines(oldText) : 0,
	};
}

function countLines(value) {
	if (!value) {
		return 0;
	}
	return value.split(/\r?\n/).length;
}

function languageForPath(file) {
	return EXTENSION_TO_LANGUAGE[extname(file).toLowerCase()] || "";
}

function categorizeToolError(text) {
	const lower = String(text || "").toLowerCase();
	if (/exit code|command failed|non-zero/.test(lower)) {
		return "Exit Code";
	}
	if (/reject|denied|not approved/.test(lower)) {
		return "User Rejected";
	}
	if (/edit failed|failed to edit/.test(lower)) {
		return "Edit Failed";
	}
	if (/file changed|modified since/.test(lower)) {
		return "File Changed";
	}
	if (/too large|max size|exceeds/.test(lower)) {
		return "File Too Large";
	}
	if (/not found|no such file/.test(lower)) {
		return "File Not Found";
	}
	return "Other";
}

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}
