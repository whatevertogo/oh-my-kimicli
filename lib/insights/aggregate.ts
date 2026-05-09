export function aggregateData(sessions, facets) {
	const generatedAt = new Date().toISOString();
	const metas = sessions.filter((meta) => !meta.isMetaSession);
	const responseTimes = metas.flatMap((meta) => meta.userResponseTimes);
	const activeDays = new Set(
		metas
			.flatMap((meta) => meta.userMessageTimestamps)
			.map((timestamp) => String(timestamp).slice(0, 10))
			.filter(Boolean),
	);
	const files = new Set(metas.flatMap((meta) => meta.filesModified));
	const aggregated = {
		generatedAt,
		scannedSessions: sessions.length,
		analyzedSessions: metas.length,
		facetSessions: facets.length,
		totalUserMessages: sum(metas, "userMessageCount"),
		totalAssistantSteps: sum(metas, "assistantStepCount"),
		totalInputTokens: sum(metas, "inputTokens"),
		totalOutputTokens: sum(metas, "outputTokens"),
		totalCacheReadTokens: sum(metas, "cacheReadTokens"),
		totalCacheCreationTokens: sum(metas, "cacheCreationTokens"),
		totalToolCalls: metas.reduce(
			(total, meta) =>
				total + Object.values(meta.toolCounts).reduce((a, b) => a + b, 0),
			0,
		),
		totalToolErrors: sum(metas, "toolErrorCount"),
		totalLinesAdded: sum(metas, "linesAdded"),
		totalLinesRemoved: sum(metas, "linesRemoved"),
		totalFilesModified: files.size,
		totalGitCommits: sum(metas, "gitCommits"),
		totalGitPushes: sum(metas, "gitPushes"),
		daysActive: activeDays.size,
		messagesPerDay: activeDays.size
			? sum(metas, "userMessageCount") / activeDays.size
			: 0,
		averageResponseSeconds: average(responseTimes),
		medianResponseSeconds: median(responseTimes),
		toolCounts: mergeCountMaps(metas.map((meta) => meta.toolCounts)),
		toolErrorCategories: mergeCountMaps(
			metas.map((meta) => meta.toolErrorCategories),
		),
		languages: mergeCountMaps(metas.map((meta) => meta.languages)),
		projects: aggregateProjects(metas),
		goalCategories: mergeCountMaps(facets.map((facet) => facet.goalCategories)),
		outcomes: countStrings(facets.map((facet) => facet.outcome)),
		satisfaction: mergeCountMaps(
			facets.map((facet) => facet.userSatisfactionCounts),
		),
		helpfulness: countStrings(
			facets.map((facet) => facet.assistantHelpfulness),
		),
		sessionTypes: countStrings(facets.map((facet) => facet.sessionType)),
		friction: mergeCountMaps(facets.map((facet) => facet.frictionCounts)),
		primarySuccess: countStrings(facets.map((facet) => facet.primarySuccess)),
		frictionDetails: facets
			.map((facet) => facet.frictionDetail)
			.filter(Boolean)
			.slice(0, 20),
		sessionSummaries: facets
			.map((facet) => facet.briefSummary)
			.filter(Boolean)
			.slice(0, 50),
		multiSessionUsage: detectMultiSessionUsage(metas),
		sessionTextSummaries: buildSessionSummaries(metas),
		frictionDetailsFromMetas: buildFrictionDetails(metas),
		userInstructionsToAssistant: buildUserInstructions(metas),
		userLanguage: buildLanguageProfile(metas),
		timeOfDay: buildTimeOfDay(metas),
		workflowSignals: buildWorkflowSignals(metas),
	};
	return aggregated;
}

function sum(items, key) {
	return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function mergeCountMaps(maps) {
	const out = {};
	for (const map of maps) {
		for (const [key, value] of Object.entries(map || {})) {
			out[key] = (out[key] || 0) + Number(value || 0);
		}
	}
	return sortCountMap(out);
}

function countStrings(values) {
	const out = {};
	for (const value of values.filter(Boolean)) {
		out[value] = (out[value] || 0) + 1;
	}
	return sortCountMap(out);
}

function aggregateProjects(metas) {
	const out = {};
	for (const meta of metas) {
		const key = meta.projectPath || meta.projectHash || "unknown";
		out[key] ||= { sessions: 0, messages: 0 };
		out[key].sessions += 1;
		out[key].messages += meta.userMessageCount;
	}
	return Object.fromEntries(
		Object.entries(out)
			.sort((a, b) => b[1].messages - a[1].messages)
			.slice(0, 20),
	);
}

function sortCountMap(map) {
	return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

function average(values) {
	return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values) {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectMultiSessionUsage(metas) {
	const events = [];
	for (const meta of metas) {
		for (const timestamp of meta.userMessageTimestamps) {
			const time = Date.parse(timestamp);
			if (Number.isFinite(time)) {
				events.push({ sessionId: meta.sessionId, time });
			}
		}
	}
	events.sort((a, b) => a.time - b.time);

	let windows = 0;
	let left = 0;
	for (let right = 0; right < events.length; right++) {
		while (events[right].time - events[left].time > 30 * 60 * 1000) {
			left++;
		}
		const seen = new Set();
		let switched = false;
		for (let i = left; i <= right; i++) {
			const id = events[i].sessionId;
			if (seen.size > 0 && !seen.has(id)) {
				switched = true;
			}
			seen.add(id);
		}
		const idsInWindow = [];
		for (let i = left; i <= right; i++) {
			idsInWindow.push(events[i].sessionId);
		}
		for (let i = 2; i < idsInWindow.length; i++) {
			if (idsInWindow[i] === idsInWindow[0] && idsInWindow[i - 1] !== idsInWindow[0]) {
				windows++;
				break;
			}
		}
	}
	return { detected: windows > 0, windows };
}

function buildSessionSummaries(metas) {
	return metas
		.filter((meta) => !meta.isMetaSession && meta.userMessageCount > 0)
		.slice(0, 50)
		.map(
			(meta) =>
				`${meta.projectPath || "unknown project"}: ${truncate(meta.firstPrompt, 180) || "no prompt"} (${meta.userMessageCount} user messages, ${meta.assistantStepCount} assistant steps)`,
		);
}

function buildFrictionDetails(metas) {
	const details = [];
	for (const meta of metas.filter((item) => !item.isMetaSession)) {
		for (const [category, count] of Object.entries(
			meta.toolErrorCategories || {},
		)) {
			details.push(
				`${meta.projectPath || meta.projectHash}: ${category} occurred ${count} time(s) in session ${meta.sessionId}.`,
			);
		}
		if (meta.userInterruptions > 0) {
			details.push(
				`${meta.projectPath || meta.projectHash}: user interrupted ${meta.userInterruptions} time(s) in session ${meta.sessionId}.`,
			);
		}
	}
	return details.slice(0, 30);
}

function buildUserInstructions(metas) {
	const counts = new Map();
	for (const meta of metas.filter((item) => !item.isMetaSession)) {
		const prompt = truncate(meta.firstPrompt, 180).trim();
		if (!prompt) {
			continue;
		}
		const key = prompt.toLowerCase();
		counts.set(key, {
			instruction: prompt,
			count: (counts.get(key)?.count || 0) + 1,
		});
	}
	return Array.from(counts.values())
		.filter((item) => item.count > 1)
		.sort((a, b) => b.count - a.count)
		.slice(0, 25);
}

function buildLanguageProfile(metas) {
	const counts = { zh: 0, en: 0, mixed: 0, unknown: 0 };
	for (const meta of metas.filter((item) => !item.isMetaSession)) {
		const language = classifyLanguage(meta.firstPrompt).code;
		counts[language] = (counts[language] || 0) + 1;
	}
	const zhLike = counts.zh + counts.mixed;
	const enLike = counts.en;
	let code = "unknown";
	if (zhLike > 0 && zhLike >= enLike) {
		code = "zh";
	} else if (enLike > 0) {
		code = "en";
	}
	const total = Math.max(
		1,
		counts.zh + counts.en + counts.mixed + counts.unknown,
	);
	const confidence =
		code === "unknown"
			? 0
			: Math.round(((code === "zh" ? zhLike : enLike) / total) * 100) / 100;
	const labels = {
		zh: "natural Simplified Chinese",
		en: "natural English",
		mixed: "the user's mixed Chinese-English style",
		unknown: "the user's language",
	};
	return {
		code,
		label: labels[code],
		confidence,
		counts,
		instruction:
			code === "zh"
				? "Use fluent Chinese for prose; keep technical identifiers and awkward section titles in English."
				: "Use clear, concise English unless the packet evidence strongly suggests otherwise.",
	};
}

function classifyLanguage(text) {
	const value = String(text || "");
	const cjk = (value.match(/[㐀-鿿]/g) || []).length;
	const latin = (value.match(/[A-Za-z]/g) || []).length;
	if (cjk >= 2 && latin >= 6) {
		return { code: "mixed", label: "mixed Chinese-English" };
	}
	if (cjk >= 2) {
		return { code: "zh", label: "Chinese" };
	}
	if (latin >= 3) {
		return { code: "en", label: "English" };
	}
	return { code: "unknown", label: "unknown" };
}

function buildTimeOfDay(metas) {
	const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
	for (const meta of metas.filter((item) => !item.isMetaSession)) {
		for (const hour of meta.messageHours || []) {
			if (hour >= 5 && hour < 12) {
				buckets.morning += 1;
			} else if (hour >= 12 && hour < 18) {
				buckets.afternoon += 1;
			} else if (hour >= 18 && hour < 23) {
				buckets.evening += 1;
			} else {
				buckets.night += 1;
			}
		}
	}
	return buckets;
}

function buildWorkflowSignals(metas) {
	const visible = metas.filter((item) => !item.isMetaSession);
	return {
		prompt_intents: countTags(
			visible.flatMap((meta) => classifyPrompt(meta.firstPrompt)),
		),
		feature_mentions: countFeatureMentions(
			visible.map((meta) => meta.firstPrompt).join("\n"),
		),
		sessions_with_subagents: visible.filter((meta) => meta.usesSubagent).length,
		sessions_with_mcp: visible.filter((meta) => meta.usesMcp).length,
		sessions_with_web: visible.filter((meta) => meta.usesWeb).length,
		sessions_with_tool_errors: visible.filter((meta) => meta.toolErrorCount > 0)
			.length,
		high_iteration_sessions: visible.filter(
			(meta) => meta.assistantStepCount >= 5,
		).length,
		git_commit_sessions: visible.filter((meta) => meta.gitCommits > 0).length,
		average_files_modified: round(
			visible.length
				? visible.reduce(
						(total, meta) => total + meta.filesModified.length,
						0,
					) / visible.length
				: 0,
		),
	};
}

function classifyPrompt(prompt) {
	const text = String(prompt || "").toLowerCase();
	const tags = [];
	if (/review|code review|审查|检查|看看|有无/.test(text)) {
		tags.push("review");
	}
	if (/fix|bug|修复|报错|问题|失败/.test(text)) {
		tags.push("debug_fix");
	}
	if (/implement|write|add|create|实现|写|新增|做一个|生成/.test(text)) {
		tags.push("implementation");
	}
	if (/plan|方案|计划|设计|架构|怎么写|如何/.test(text)) {
		tags.push("planning");
	}
	if (/继续|直接|autonomous|ralph|ultrawork|完成/.test(text)) {
		tags.push("autonomous_execution");
	}
	if (/setup|install|doctor|config|安装|配置/.test(text)) {
		tags.push("setup_config");
	}
	return tags.length ? tags : ["general"];
}

function countTags(tags) {
	const out = {};
	for (const tag of tags) {
		out[tag] = (out[tag] || 0) + 1;
	}
	return topMap(
		Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1])),
		10,
	);
}

function countFeatureMentions(text) {
	const value = String(text || "").toLowerCase();
	const features = {
		skills: /skill|技能/g,
		hooks: /hook|钩子/g,
		plan_mode: /plan mode|enterplan|计划模式/g,
		subagents: /subagent|子智能体|agent/g,
		ralph: /ralph/g,
		ultrawork: /ultrawork/g,
		review: /review|审查/g,
		insights: /insights/g,
	};
	return Object.fromEntries(
		Object.entries(features)
			.map(([name, regex]) => [name, (value.match(regex) || []).length])
			.filter(([, count]) => count > 0)
			.sort((a, b) => b[1] - a[1]),
	);
}

function topMap(map, limit) {
	return Object.fromEntries(Object.entries(map || {}).slice(0, limit));
}

function truncate(value, max) {
	const text = String(value || "")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function round(value) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}
