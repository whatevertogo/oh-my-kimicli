import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { aggregateData } from "./aggregate.ts";
import { cleanCache, loadCached, saveCached } from "./cache.ts";
import { generateHtmlReport } from "./html.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { buildTranscript } from "./transcript.ts";
import { readWireTurns } from "./wire.ts";

const DEFAULT_LIMITS = {
	max_sessions_scanned: 500,
	max_meta_parse_sessions: 300,
	max_semantic_candidates: 80,
	max_facet_sessions: 50,
	max_deep_transcript_sessions: 20,
	max_transcript_chars_per_deep_session: 30000,
	max_transcript_chars_per_normal_session: 12000,
	max_turns_per_normal_session: 16,
	max_friction_details: 30,
	max_user_instruction_candidates: 25,
};

export function insightsPaths(env = process.env) {
	const usageDir = omkUsageDataDir(env);
	const insightsDir = join(usageDir, "insights");
	return {
		usageDir,
		insightsDir,
		sessionsDir: join(insightsDir, "sessions"),
		manifestPath: join(insightsDir, "manifest.json"),
		inputPath: join(insightsDir, "insights-input.json"),
		messagePath: join(insightsDir, "insights-agent-task.md"),
		facetsPath: join(insightsDir, "insights-facets.json"),
		reportHtmlPath: join(insightsDir, "report.html"),
		reportJsonPath: join(insightsDir, "report.json"),
	};
}

export async function generateInsightsReport(options = {}) {
	return generateMetricsOnlyReport(options);
}

export async function generateMetricsOnlyReport(options = {}) {
	const env = options.env || process.env;
	const paths = insightsPaths(env);
	mkdirSync(paths.insightsDir, { recursive: true });
	const { liteSessions, aggregated } = buildAggregatedData(options);
	const report = buildReport({
		env,
		paths,
		scannedSessions: liteSessions.length,
		analyzedSessions: aggregated.analyzedSessions,
		aggregated,
		sections: defaultSections(aggregated),
		mode: "metrics-only",
	});
	writeReport(report, paths);
	return report;
}

export async function collectInsightsMessage(options = {}) {
	const env = options.env || process.env;
	const paths = insightsPaths(env);
	mkdirSync(paths.insightsDir, { recursive: true });
	const { liteSessions, metas, aggregated } = buildAggregatedData(options);
	const sessionPackets = writeSessionPackets({
		paths,
		liteSessions,
		metas,
		options,
	});
	const manifest = buildManifest({
		paths,
		aggregated,
		sessionPackets,
		options,
	});
	const input = buildAgentInput({
		env,
		paths,
		aggregated,
		manifest,
		sessionPackets,
		options,
	});

	writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	writeFileSync(paths.inputPath, `${JSON.stringify(input, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	writeFileSync(paths.messagePath, buildInsightsAgentTask(input), {
		encoding: "utf8",
		mode: 0o600,
	});

	return {
		...input,
		paths,
		scannedSessions: liteSessions.length,
		analyzedSessions: aggregated.analyzedSessions,
	};
}

function buildAggregatedData(options = {}) {
	const env = options.env || process.env;
	cleanCache(env);
	const limit = numberOption(
		options.limit,
		DEFAULT_LIMITS.max_sessions_scanned,
	);
	const metaLimit = numberOption(
		options.metaLimit,
		DEFAULT_LIMITS.max_meta_parse_sessions,
	);
	const liteSessions = scanSessions(env).slice(0, limit);
	const metas = [];
	let parsed = 0;
	for (const session of liteSessions.slice(0, metaLimit)) {
		let meta = options.force ? null : loadCached("session-meta", session, env);
		if (!meta) {
			const turns = readWireTurns(session.wirePath);
			meta = buildSessionMeta(session, turns);
			saveCached("session-meta", session, meta, env);
			parsed += 1;
		}
		metas.push(meta);
	}
	const aggregated = aggregateData(metas, []);
	aggregated.scannedSessions = liteSessions.length;
	aggregated.uncachedParsedSessions = parsed;
	return { liteSessions, metas, aggregated };
}

function defaultSections(aggregated = {}) {
	const data = {
		scannedSessions: 0,
		analyzedSessions: 0,
		projects: {},
		toolCounts: {},
		primarySuccess: {},
		friction: {},
		toolErrorCategories: {},
		averageResponseSeconds: 0,
		daysActive: 0,
		...aggregated,
	};
	const useChinese = data.userLanguage?.code === "zh";
	const topProject =
		Object.keys(data.projects)[0] || "your KimiCLI sessions";
	const topTool = Object.keys(data.toolCounts)[0] || "tools";
	if (useChinese) {
		return {
			schema_version: 1,
			at_a_glance: {
				whats_working: `已扫描 ${data.scannedSessions} 个 session，分析 ${data.analyzedSessions} 个。主要活动集中在 ${topProject}。`,
				whats_hindering:
					renderMap(data.toolErrorCategories) ||
					"metrics-only 模式下没有看到稳定的工具错误模式。",
				quick_wins: `最高频工具是 ${topTool}。需要叙事分析时，用 /skill:insights 让当前 Kimi agent 生成报告内容。`,
				ambitious_workflows:
					"持续生成 insights，用它来迭代 skills、hooks、plan mode、subagents、Ralph 和 ultrawork。",
			},
			project_areas: { areas: projectAreas(data, "zh") },
			interaction_style: {
				narrative: `平均响应间隔：${formatSeconds(data.averageResponseSeconds)}。活跃天数：${data.daysActive}。`,
				key_pattern:
					"metrics-only 模式能识别节奏和工具使用，但更深的叙事模式需要当前 agent 生成。",
			},
			what_works: {
				intro: "成功模式需要当前 agent 的叙事分析补全。",
				impressive_workflows: mapEntries(data.primarySuccess, 3, (title, count) => ({
					title,
					description: `${count} 个 session 匹配这个模式。`,
				})),
			},
			friction_analysis: {
				intro:
					renderMap(data.friction) ||
					renderMap(data.toolErrorCategories) ||
					"metrics-only 模式下没有发现明显摩擦模式。",
				categories: mapEntries(data.toolErrorCategories, 3, (category, count) => ({
					category,
					description: `${count} 次工具错误被归为这一类。`,
					examples: [],
				})),
			},
			suggestions: {
				kimi_instructions_additions: [],
				features_to_try: [
					{
						feature: "OMK insights skill",
						one_liner: "运行 /skill:insights，让当前 Kimi agent 写叙事 sections。",
						why_for_you:
							"这样不会嵌套 kimi --print，也不会把 provider 限流风险放到外部命令里。",
						example_code: "/skill:insights",
					},
				],
				usage_patterns: [],
			},
			skill_opportunities: [
				{
					name: "insights-driven skill review",
					trigger: "当 insights 多次发现同类重复工作流时",
					why: "metrics-only 模式只能提示候选方向；叙事报告可以判断是否值得沉淀为 skill。",
					evidence: [],
					proposed_scope:
						"等待 /skill:insights 生成叙事 sections 后再决定。",
					risk: "证据不足时创建 skill 会增加噪声。",
					example_prompt: "/skill:insights",
					recommended_action: "no_action",
				},
			],
			on_the_horizon: {
				intro: "后续报告可以把使用模式连接到更高层的自动化，而不是只展示统计。",
				opportunities: horizonOpportunities(data, "zh"),
			},
			fun_ending: {
				headline: "你的工作流已经开始反过来塑造工具",
				detail: `这批 session 里，最高频意图是 ${topIntent(data)}，最高频工具是 ${topTool}。即使没有叙事 pass，也能看出你在不断把临时协作沉淀成可复用机制。`,
			},
		};
	}
	return {
		schema_version: 1,
		at_a_glance: {
			whats_working: `Scanned ${data.scannedSessions} sessions and analyzed ${data.analyzedSessions}. Most activity centers on ${topProject}.`,
			whats_hindering:
				renderMap(data.toolErrorCategories) ||
				"No recurring tool-error pattern is visible in metrics-only mode.",
			quick_wins: `Top tool: ${topTool}. Use /skill:insights for a narrative report generated by the current Kimi agent.`,
			ambitious_workflows:
				"Use recurring reports to tune skills, hooks, plan mode, subagents, Ralph, and ultrawork.",
		},
		project_areas: { areas: projectAreas(data, "en") },
		interaction_style: {
			narrative: `Average response time: ${formatSeconds(data.averageResponseSeconds)}. Active days: ${data.daysActive}.`,
			key_pattern:
				"Metrics-only mode can identify cadence and tool usage, but not deeper narrative patterns.",
		},
		what_works: {
			intro: "Success patterns require the current agent's narrative pass.",
			impressive_workflows: mapEntries(data.primarySuccess, 3, (title, count) => ({
				title,
				description: `${count} matching sessions.`,
			})),
		},
		friction_analysis: {
			intro:
				renderMap(data.friction) ||
				renderMap(data.toolErrorCategories) ||
				"No major friction pattern found in metrics-only mode.",
			categories: mapEntries(data.toolErrorCategories, 3, (category, count) => ({
				category,
				description: `${count} tool errors were categorized this way.`,
				examples: [],
			})),
		},
		suggestions: {
			kimi_instructions_additions: [],
			features_to_try: [
				{
					feature: "OMK insights skill",
					one_liner: "Run /skill:insights for the current Kimi agent to write the narrative sections.",
					why_for_you:
						"It avoids nested kimi --print calls and keeps rate limits under the active session.",
					example_code: "/skill:insights",
				},
			],
			usage_patterns: [],
		},
		skill_opportunities: [
			{
				name: "insights-driven skill review",
				trigger: "when insights repeatedly finds the same workflow pattern",
				why: "Metrics-only mode can point at candidates; the narrative pass should decide whether a skill is warranted.",
				evidence: [],
				proposed_scope:
					"Wait for /skill:insights to generate narrative sections before applying changes.",
				risk: "Creating skills from weak evidence adds noise.",
				example_prompt: "/skill:insights",
				recommended_action: "no_action",
			},
		],
		on_the_horizon: {
			intro: "Future reports can connect usage patterns to higher-level automation.",
			opportunities: horizonOpportunities(data, "en"),
		},
		fun_ending: {
			headline: "Your workflow is starting to shape the tooling back",
			detail: `The strongest intent is ${topIntent(data)}, and the top tool is ${topTool}. Even without a narrative pass, the sessions show repeated attempts to turn ad-hoc collaboration into reusable mechanisms.`,
		},
	};
}

function projectAreas(data, language) {
	return Object.entries(data.projects || {})
		.slice(0, 5)
		.map(([name, value]) => ({
			name,
			session_count: Number(value?.sessions || 0),
			description:
				language === "zh"
					? `${Number(value?.messages || 0)} 条用户消息，分布在 ${Number(value?.sessions || 0)} 个 session。`
					: `${Number(value?.messages || 0)} user messages across ${Number(value?.sessions || 0)} sessions.`,
		}));
}

function horizonOpportunities(data, language) {
	const topTool = Object.keys(data.toolCounts || {})[0] || "ReadFile";
	if (language === "zh") {
		return [
			{
				title: "由 insights 反向生成工作流",
				whats_possible: "当报告连续发现同类摩擦时，下一步不只是阅读建议，而是让 agent 直接起草 skill、hook 或 AGENTS.md 规则。",
				how_to_try: "运行 /skill:insights 后，只确认一个最强候选，让 agent 基于真实 session 数据改插件。",
				copyable_prompt: "基于这份 insights 报告，先只实现最有证据的一个 skill/hook 改进。",
			},
		];
	}
	return [
		{
			title: "Generate workflows from insights",
			whats_possible: "When reports repeatedly find the same friction, the next step can be drafting a skill, hook, or AGENTS.md rule from real session evidence.",
			how_to_try: "Run /skill:insights, confirm one strongest candidate, and let the agent update the plugin.",
			copyable_prompt: "Based on this insights report, implement only the strongest evidence-backed skill or hook improvement.",
		},
	];
}

function topIntent(data) {
	return Object.keys(data.workflowSignals?.prompt_intents || {})[0] || "general";
}

function renderMap(map, formatter = (value) => `${value}`) {
	return Object.entries(map || {})
		.slice(0, 8)
		.map(([key, value]) => `- ${key}: ${formatter(value)}`)
		.join("\n");
}

function formatSeconds(value) {
	if (!value) {
		return "n/a";
	}
	return `${Math.round(value)}s`;
}

function mapEntries(map, limit, mapper) {
	return Object.entries(map || {})
		.slice(0, limit)
		.map(([key, value]) => mapper(key, value));
}

function writeSessionPackets({ paths, liteSessions, metas, options }) {
	rmSync(paths.sessionsDir, { recursive: true, force: true });
	mkdirSync(paths.sessionsDir, { recursive: true });
	const sessionById = new Map(
		liteSessions.map((session) => [session.sessionId, session]),
	);
	const candidates = metas
		.filter((meta) => !meta.isMetaSession && meta.userMessageCount > 0)
		.map((meta) => ({
			meta,
			session: sessionById.get(meta.sessionId),
			score: scoreSession(meta),
		}))
		.filter((entry) => entry.session)
		.sort((a, b) => b.score - a.score)
		.slice(
			0,
			numberOption(
				options.semanticLimit,
				DEFAULT_LIMITS.max_semantic_candidates,
			),
		);
	const facetLimit = numberOption(
		options.facetLimit,
		DEFAULT_LIMITS.max_facet_sessions,
	);
	const deepLimit = Math.min(
		numberOption(
			options.deepTranscriptLimit,
			DEFAULT_LIMITS.max_deep_transcript_sessions,
		),
		facetLimit,
	);
	return candidates.map((entry, index) => {
		const readMode = index < deepLimit ? "deep" : "normal";
		const charLimit =
			readMode === "deep"
				? DEFAULT_LIMITS.max_transcript_chars_per_deep_session
				: DEFAULT_LIMITS.max_transcript_chars_per_normal_session;
		const turns = readWireTurns(entry.session.wirePath).filter(
			(turn) => !turn.internal,
		);
		const transcript = buildTranscript(
			entry.session,
			limitTurns(turns, readMode),
			entry.meta,
		);
		const packetPath = join(
			paths.sessionsDir,
			`${safeFileName(entry.meta.sessionId)}.md`,
		);
		const packet = sessionPacketMarkdown({
			meta: entry.meta,
			score: entry.score,
			readMode,
			transcript: truncate(transcript, charLimit),
			tags: classifyPrompt(entry.meta.firstPrompt),
		});
		writeFileSync(packetPath, packet, { encoding: "utf8", mode: 0o600 });
		return {
			session_id: entry.meta.sessionId,
			path: packetPath,
			rank: index + 1,
			score: entry.score,
			why_selected: selectionReasons(entry.meta),
			project_path: entry.meta.projectPath,
			first_prompt: truncate(entry.meta.firstPrompt, 240),
			user_message_count: entry.meta.userMessageCount,
			assistant_step_count: entry.meta.assistantStepCount,
			tool_error_count: entry.meta.toolErrorCount,
			files_modified_count: entry.meta.filesModified.length,
			recommended_read_mode: readMode,
			workflow_tags: classifyPrompt(entry.meta.firstPrompt),
		};
	});
}

function buildManifest({ paths, aggregated, sessionPackets, options }) {
	return {
		schema_version: 2,
		generated_at: new Date().toISOString(),
		sessions_root: paths.sessionsDir,
		input_path: paths.inputPath,
		task_path: paths.messagePath,
		facets_path: paths.facetsPath,
		report_html_path: paths.reportHtmlPath,
		report_json_path: paths.reportJsonPath,
		limits: effectiveLimits(options),
		aggregate_metrics: limitAggregated(aggregated),
		ranked_sessions: sessionPackets,
	};
}

function buildAgentInput({
	env,
	paths,
	aggregated,
	_manifest,
	sessionPackets,
	options,
}) {
	return {
		schema_version: 2,
		generated_at: new Date().toISOString(),
		source: "oh-my-kimicli",
		kimi_share_dir: kimiShareDir(env),
		preferred_output_language: aggregated.userLanguage,
		limits: effectiveLimits(options),
		paths: {
			manifest: paths.manifestPath,
			input: paths.inputPath,
			task: paths.messagePath,
			facets: paths.facetsPath,
			html: paths.reportHtmlPath,
			json: paths.reportJsonPath,
			sessions_dir: paths.sessionsDir,
		},
		aggregate_metrics: limitAggregated(aggregated),
		ranked_sessions: sessionPackets,
		session_reading_strategy: {
			target_facets: numberOption(
				options.facetLimit,
				DEFAULT_LIMITS.max_facet_sessions,
			),
			read_first:
				"Read the highest-ranked deep sessions first, then continue through normal sessions until facets are strong enough or target_facets is reached.",
			do_not_scan:
				"Do not scan ~/.kimi/sessions manually. Use only the manifest and session packet paths.",
		},
		feature_reference: recommendationContext(),
	};
}

function buildInsightsAgentTask(input) {
	return `${isChinese(input.preferred_output_language) ? chineseTaskIntro(input) : englishTaskIntro(input)}

## Required Workflow

1. Read \`${input.paths.input}\` and \`${input.paths.manifest}\`.
2. Read ranked session packet files from \`${input.paths.sessions_dir}\`, starting with \`recommended_read_mode: "deep"\`.
3. Extract up to ${input.limits.max_facet_sessions} session facets and write \`${input.paths.facets}\`.
4. Build the final \`${input.paths.json}\` with \`schema_version: 2\`, metrics, facets, sections, and quality notes.
5. Build the final self-contained HTML report at \`${input.paths.html}\`.
6. Self-review before the final response.

## Hard Boundaries

- Do not run bare \`omk insights\`.
- Do not run \`omk insights render\`.
- Do not run \`kimi --print\`.
- Do not manually scan \`~/.kimi/sessions\`.
- Do not paste full raw transcripts into chat.
- Do not create or update skills, hooks, or AGENTS.md during this report run.
- Do not invent sections just to fill the page.

## Facets JSON Shape

\`\`\`json
${JSON.stringify(facetsSchemaExample(), null, 2)}
\`\`\`

## Final Report JSON Shape

\`\`\`json
${JSON.stringify(reportJsonSchemaExample(), null, 2)}
\`\`\`

## Section Titles

Use these titles unless the report language makes another wording clearly better:

- At a Glance
- Project Areas
- How You Use KimiCLI
- Impressive Things
- Where Things Go Wrong
- Features to Try
- New Usage Patterns
- On the Horizon
- Skill Suggestions
- Metrics
- Evidence Notes

## Prompt Quality Gate

- Generate facets first, then sections, then At a Glance last.
- Use second person for interaction-style analysis.
- Do not turn tool counts into insight by themselves.
- Suggestions must trace to session evidence.
- If evidence is weak, omit the section or move it to Evidence Notes.
- Skill Suggestions only appear when there is repeated usage, clear friction, or high leverage.
- Final response asks about creating/updating a skill, hook, or AGENTS.md instruction only when a real candidate exists with \`create_skill\`, \`update_skill\`, \`add_hook\`, or \`add_agents_instruction\`.

## Available Evidence

- Manifest: \`${input.paths.manifest}\`
- Input JSON: \`${input.paths.input}\`
- Session packets directory: \`${input.paths.sessionsDir}\`
- Ranked sessions available: ${input.ranked_sessions.length}
- Sessions scanned: ${input.aggregate_metrics.scannedSessions}
- Sessions analyzed: ${input.aggregate_metrics.analyzedSessions}
- Preferred language hint: ${input.preferred_output_language.label}
`;
}

function chineseTaskIntro(_input) {
	return `OMK_INSIGHTS_INTERNAL

# OMK Insights Agent Task

你是当前 KimiCLI agent。OMK 已经完成确定性收集，请你基于 manifest 和 session packet 直接生成最终报告。

语言由你根据真实 session 和当前用户语境决定；中文用户优先使用自然中文正文，但命令、路径、KimiCLI、OMK、Ralph、ultrawork、hooks、skills、subagents 和 section title 可以保留英文。

目标不是复述指标，而是像 Claude Code insights 一样，从真实 session 中提炼工作领域、互动风格、有效模式、摩擦、建议、未来工作流，以及是否值得沉淀新 skill。`;
}

function englishTaskIntro() {
	return `OMK_INSIGHTS_INTERNAL

# OMK Insights Agent Task

You are the current KimiCLI agent. OMK has completed deterministic collection. Use the manifest and session packets to write the final report directly.

Choose the report language from real session usage and the current user context. Keep commands, paths, KimiCLI, OMK, Ralph, ultrawork, hooks, skills, subagents, and section titles in English when that is clearer.

The goal is not to restate metrics. Borrow Claude Code insights' shape: derive project areas, interaction style, effective workflows, friction, suggestions, future workflows, and whether any repeated pattern deserves a skill.`;
}

function buildReport({
	env,
	paths,
	scannedSessions,
	analyzedSessions,
	aggregated,
	sections,
	mode,
}) {
	return {
		schema_version: 2,
		generatedAt: new Date().toISOString(),
		source: "oh-my-kimicli",
		mode,
		language: aggregated.userLanguage?.code || "unknown",
		kimiShareDir: kimiShareDir(env),
		reportHtmlPath: paths.reportHtmlPath,
		reportJsonPath: paths.reportJsonPath,
		scannedSessions,
		analyzedSessions,
		aggregated,
		metrics: aggregated,
		facets_summary: {
			total: 0,
			goal_categories: {},
			outcomes: {},
			satisfaction: {},
			friction: {},
		},
		facets: [],
		sections,
		quality: {
			evidence_strength: mode === "metrics-only" ? "weak" : "mixed",
			omitted_sections: [],
			data_limits:
				mode === "metrics-only"
					? ["Narrative analysis skipped; run /skill:insights."]
					: [],
		},
	};
}

function writeReport(report, paths) {
	writeFileSync(paths.reportHtmlPath, generateHtmlReport(report), {
		encoding: "utf8",
		mode: 0o600,
	});
	writeFileSync(paths.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

function sessionPacketMarkdown({ meta, score, readMode, transcript, tags }) {
	return [
		`# Session ${meta.sessionId}`,
		"",
		`Project: ${meta.projectPath || meta.projectHash}`,
		`Started: ${meta.startTime}`,
		`Ended: ${meta.endTime}`,
		`Duration minutes: ${round(meta.durationMinutes)}`,
		`Selection score: ${score}`,
		`Recommended read mode: ${readMode}`,
		`Workflow tags: ${tags.join(", ")}`,
		`User messages: ${meta.userMessageCount}`,
		`Assistant steps: ${meta.assistantStepCount}`,
		`Tool calls: ${
			Object.entries(meta.toolCounts || {})
				.slice(0, 8)
				.map(([name, count]) => `${name} ${count}`)
				.join(", ") || "none"
		}`,
		`Tool errors: ${meta.toolErrorCount}`,
		`Files modified: ${meta.filesModified.slice(0, 20).join(", ") || "none"}`,
		"",
		"## User Goal Signals",
		"",
		`- First prompt: ${truncate(meta.firstPrompt, 600) || "none"}`,
		`- Selection reasons: ${selectionReasons(meta).join(", ")}`,
		"",
		"## Metrics",
		"",
		`- Input tokens: ${meta.inputTokens}`,
		`- Output tokens: ${meta.outputTokens}`,
		`- Lines added: ${meta.linesAdded}`,
		`- Lines removed: ${meta.linesRemoved}`,
		`- User interruptions: ${meta.userInterruptions}`,
		"",
		"## Transcript",
		"",
		transcript || "No readable transcript content.",
	].join("\n");
}

function limitTurns(turns, readMode) {
	if (
		readMode === "deep" ||
		turns.length <= DEFAULT_LIMITS.max_turns_per_normal_session
	) {
		return turns;
	}
	const head = turns.slice(0, 6);
	const tail = turns.slice(-6);
	const errorTurns = turns.filter((turn) =>
		turn.events.some(
			(event) =>
				event.type === "ToolResult" && event.payload?.return_value?.is_error,
		),
	);
	return uniqueTurns([...head, ...errorTurns, ...tail]).slice(
		0,
		DEFAULT_LIMITS.max_turns_per_normal_session,
	);
}

function uniqueTurns(turns) {
	const seen = new Set();
	return turns.filter((turn) => {
		const key = `${turn.timestamp}:${turn.userInput}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function scoreSession(meta) {
	return (
		meta.userMessageCount * 10 +
		meta.assistantStepCount * 3 +
		meta.filesModified.length * 4 +
		meta.toolErrorCount * 8 +
		meta.userInterruptions * 8 +
		(meta.usesSubagent ? 12 : 0) +
		(meta.usesMcp ? 6 : 0) +
		(meta.usesWeb ? 4 : 0) +
		classifyPrompt(meta.firstPrompt).length * 2
	);
}

function selectionReasons(meta) {
	const reasons = [];
	if (meta.userMessageCount >= 2) {
		reasons.push("multiple_user_turns");
	}
	if (meta.assistantStepCount >= 5) {
		reasons.push("high_iteration");
	}
	if (meta.toolErrorCount > 0) {
		reasons.push("tool_errors");
	}
	if (meta.filesModified.length > 0) {
		reasons.push("files_modified");
	}
	if (meta.userInterruptions > 0) {
		reasons.push("user_interruption");
	}
	if (meta.usesSubagent) {
		reasons.push("subagent_usage");
	}
	return reasons.length ? reasons : ["substantive_prompt"];
}

function effectiveLimits(options = {}) {
	return {
		max_sessions_scanned: numberOption(
			options.limit,
			DEFAULT_LIMITS.max_sessions_scanned,
		),
		max_meta_parse_sessions: numberOption(
			options.metaLimit,
			DEFAULT_LIMITS.max_meta_parse_sessions,
		),
		max_semantic_candidates: numberOption(
			options.semanticLimit,
			DEFAULT_LIMITS.max_semantic_candidates,
		),
		max_facet_sessions: numberOption(
			options.facetLimit,
			DEFAULT_LIMITS.max_facet_sessions,
		),
		max_deep_transcript_sessions: numberOption(
			options.deepTranscriptLimit,
			DEFAULT_LIMITS.max_deep_transcript_sessions,
		),
		max_transcript_chars_per_deep_session:
			DEFAULT_LIMITS.max_transcript_chars_per_deep_session,
		max_transcript_chars_per_normal_session:
			DEFAULT_LIMITS.max_transcript_chars_per_normal_session,
		max_turns_per_normal_session: DEFAULT_LIMITS.max_turns_per_normal_session,
		max_friction_details: DEFAULT_LIMITS.max_friction_details,
		max_user_instruction_candidates:
			DEFAULT_LIMITS.max_user_instruction_candidates,
	};
}

function limitAggregated(aggregated) {
	return {
		...aggregated,
		toolCounts: topMap(aggregated.toolCounts, 15),
		toolErrorCategories: topMap(aggregated.toolErrorCategories, 10),
		languages: topMap(aggregated.languages, 15),
		projects: Object.fromEntries(
			Object.entries(aggregated.projects || {}).slice(0, 10),
		),
		goalCategories: topMap(aggregated.goalCategories, 10),
		outcomes: topMap(aggregated.outcomes, 10),
		satisfaction: topMap(aggregated.satisfaction, 10),
		helpfulness: topMap(aggregated.helpfulness, 10),
		sessionTypes: topMap(aggregated.sessionTypes, 10),
		friction: topMap(aggregated.friction, 10),
		primarySuccess: topMap(aggregated.primarySuccess, 10),
		frictionDetails: aggregated.frictionDetails.slice(
			0,
			DEFAULT_LIMITS.max_friction_details,
		),
		sessionSummaries: aggregated.sessionSummaries.slice(
			0,
			DEFAULT_LIMITS.max_facet_sessions,
		),
		userInstructionsToAssistant: (
			aggregated.userInstructionsToAssistant || []
		).slice(0, DEFAULT_LIMITS.max_user_instruction_candidates),
		userLanguage: aggregated.userLanguage,
		timeOfDay: aggregated.timeOfDay,
		workflowSignals: aggregated.workflowSignals,
	};
}

function topMap(map, limit) {
	return Object.fromEntries(Object.entries(map || {}).slice(0, limit));
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

function recommendationContext() {
	return {
		kimi_cli: [
			"skills via /skill:<name>",
			"native plan mode for approval-oriented planning",
			"subagents for focused codebase exploration or independent work",
			"headless kimi --print for non-interactive one-shot tasks when appropriate",
		],
		omk: [
			"hooks for next-turn prompt injection and workflow guardrails",
			"omk-ralph for project-local continuation until done or blocked",
			"ultrawork for autonomous multi-step execution",
			"omk-review for focused review artifacts under .omk",
			"omk insights message for bounded usage analysis without nested LLM calls",
		],
		skill_actions: [
			"create_skill: propose a new skill only for repeated, reusable workflows",
			"update_skill: strengthen an existing skill when the pattern maps to one already installed",
			"add_hook: use for turn-level guardrails or automatic reminders",
			"add_agents_instruction: use for stable project or user preferences",
			"no_action: use when the evidence is weak or one-off",
		],
	};
}

function facetsSchemaExample() {
	return {
		schema_version: 1,
		facets: [
			{
				session_id: "...",
				underlying_goal: "...",
				goal_categories: { code_review: 1 },
				outcome:
					"fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear_from_transcript",
				user_satisfaction_counts: { satisfied: 1 },
				assistant_helpfulness:
					"unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
				session_type:
					"single_task|multi_task|iterative_refinement|exploration|quick_question",
				friction_counts: { wrong_approach: 1 },
				friction_detail: "One concrete sentence, or empty string.",
				primary_success:
					"none|fast_accurate_search|correct_code_edits|good_explanations|proactive_help|multi_file_changes|good_debugging|workflow_automation",
				brief_summary:
					"One sentence: what the user wanted and whether they got it.",
				user_instructions_to_assistant: ["..."],
				evidence: ["..."],
			},
		],
	};
}

function reportJsonSchemaExample() {
	return {
		schema_version: 2,
		generated_at: "...",
		mode: "agent-generated",
		language: "zh-CN",
		metrics: {},
		facets_summary: {},
		facets: [],
		sections: {
			at_a_glance: {
				whats_working: "...",
				whats_hindering: "...",
				quick_wins: "...",
				ambitious_workflows: "...",
			},
			project_areas: {
				areas: [{ name: "...", session_count: 3, description: "..." }],
			},
			interaction_style: { narrative: "...", key_pattern: "..." },
			what_works: {
				intro: "...",
				impressive_workflows: [{ title: "...", description: "..." }],
			},
			friction_analysis: {
				intro: "...",
				categories: [
					{ category: "...", description: "...", examples: ["...", "..."] },
				],
			},
			suggestions: {
				kimi_instructions_additions: [
					{ addition: "...", why: "...", prompt_scaffold: "..." },
				],
				features_to_try: [
					{
						feature: "...",
						one_liner: "...",
						why_for_you: "...",
						example_code: "...",
					},
				],
				usage_patterns: [
					{
						title: "...",
						suggestion: "...",
						detail: "...",
						copyable_prompt: "...",
					},
				],
			},
			on_the_horizon: {
				intro: "...",
				opportunities: [
					{
						title: "...",
						whats_possible: "...",
						how_to_try: "...",
						copyable_prompt: "...",
					},
				],
			},
			skill_opportunities: {
				candidates: [
					{
						name: "...",
						trigger: "...",
						why: "...",
						evidence_sessions: ["..."],
						expected_behavior: "...",
						starter_prompt: "...",
						recommended_action: "create_skill",
					},
				],
			},
		},
		quality: {
			evidence_strength: "strong|mixed|weak",
			omitted_sections: [],
			data_limits: [],
		},
	};
}

function isChinese(profile = {}) {
	return profile.code === "zh" || profile.code === "mixed";
}

function safeFileName(value) {
	return String(value || "session").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function numberOption(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : fallback;
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
