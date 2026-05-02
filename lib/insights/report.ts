import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { aggregateData } from "./aggregate.ts";
import { loadCached, saveCached } from "./cache.ts";
import { generateHtmlReport } from "./html.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { defaultSections } from "./sections.ts";
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
  max_user_instruction_candidates: 25
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
    reportJsonPath: join(insightsDir, "report.json")
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
    mode: "metrics-only"
  });
  writeReport(report, paths);
  return report;
}

export async function collectInsightsMessage(options = {}) {
  const env = options.env || process.env;
  const paths = insightsPaths(env);
  mkdirSync(paths.insightsDir, { recursive: true });
  const { liteSessions, metas, aggregated } = buildAggregatedData(options);
  const sessionPackets = writeSessionPackets({ paths, liteSessions, metas, options });
  const manifest = buildManifest({ paths, aggregated, sessionPackets, options });
  const input = buildAgentInput({ env, paths, aggregated, manifest, sessionPackets, options });

  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  writeFileSync(paths.inputPath, `${JSON.stringify(input, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.messagePath, buildInsightsAgentTask(input), { encoding: "utf8", mode: 0o600 });

  return {
    ...input,
    paths,
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions
  };
}

function buildAggregatedData(options = {}) {
  const env = options.env || process.env;
  const limit = numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned);
  const metaLimit = numberOption(options.metaLimit, DEFAULT_LIMITS.max_meta_parse_sessions);
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
  aggregated.sessionSummaries = buildSessionSummaries(metas);
  aggregated.frictionDetails = buildFrictionDetails(metas);
  aggregated.userInstructionsToAssistant = buildUserInstructions(metas);
  aggregated.userLanguage = buildLanguageProfile(metas);
  aggregated.timeOfDay = buildTimeOfDay(metas);
  aggregated.workflowSignals = buildWorkflowSignals(metas);
  aggregated.uncachedParsedSessions = parsed;
  return { liteSessions, metas, aggregated };
}

function writeSessionPackets({ paths, liteSessions, metas, options }) {
  rmSync(paths.sessionsDir, { recursive: true, force: true });
  mkdirSync(paths.sessionsDir, { recursive: true });
  const sessionById = new Map(liteSessions.map((session) => [session.sessionId, session]));
  const candidates = metas
    .filter((meta) => !meta.isMetaSession && meta.userMessageCount > 0)
    .map((meta) => ({ meta, session: sessionById.get(meta.sessionId), score: scoreSession(meta) }))
    .filter((entry) => entry.session)
    .sort((a, b) => b.score - a.score)
    .slice(0, numberOption(options.semanticLimit, DEFAULT_LIMITS.max_semantic_candidates));
  const facetLimit = numberOption(options.facetLimit, DEFAULT_LIMITS.max_facet_sessions);
  const deepLimit = Math.min(
    numberOption(options.deepTranscriptLimit, DEFAULT_LIMITS.max_deep_transcript_sessions),
    facetLimit
  );
  return candidates.map((entry, index) => {
    const readMode = index < deepLimit ? "deep" : "normal";
    const charLimit =
      readMode === "deep"
        ? DEFAULT_LIMITS.max_transcript_chars_per_deep_session
        : DEFAULT_LIMITS.max_transcript_chars_per_normal_session;
    const turns = readWireTurns(entry.session.wirePath).filter((turn) => !turn.internal);
    const transcript = buildTranscript(entry.session, limitTurns(turns, readMode), entry.meta);
    const packetPath = join(paths.sessionsDir, `${safeFileName(entry.meta.sessionId)}.md`);
    const packet = sessionPacketMarkdown({
      meta: entry.meta,
      score: entry.score,
      readMode,
      transcript: truncate(transcript, charLimit),
      tags: classifyPrompt(entry.meta.firstPrompt)
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
      workflow_tags: classifyPrompt(entry.meta.firstPrompt)
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
    ranked_sessions: sessionPackets
  };
}

function buildAgentInput({ env, paths, aggregated, manifest, sessionPackets, options }) {
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
      sessions_dir: paths.sessionsDir
    },
    aggregate_metrics: limitAggregated(aggregated),
    ranked_sessions: sessionPackets,
    session_reading_strategy: {
      target_facets: numberOption(options.facetLimit, DEFAULT_LIMITS.max_facet_sessions),
      read_first: "Read the highest-ranked deep sessions first, then continue through normal sessions until facets are strong enough or target_facets is reached.",
      do_not_scan: "Do not scan ~/.kimi/sessions manually. Use only the manifest and session packet paths."
    },
    feature_reference: recommendationContext()
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
- Session packets directory: \`${input.paths.sessions_dir}\`
- Ranked sessions available: ${input.ranked_sessions.length}
- Sessions scanned: ${input.aggregate_metrics.scannedSessions}
- Sessions analyzed: ${input.aggregate_metrics.analyzedSessions}
- Preferred language hint: ${input.preferred_output_language.label}
`;
}

function chineseTaskIntro(input) {
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

function buildReport({ env, paths, scannedSessions, analyzedSessions, aggregated, sections, mode }) {
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
      friction: {}
    },
    facets: [],
    sections,
    quality: {
      evidence_strength: mode === "metrics-only" ? "weak" : "mixed",
      omitted_sections: [],
      data_limits: mode === "metrics-only" ? ["Narrative analysis skipped; run /skill:insights."] : []
    }
  };
}

function writeReport(report, paths) {
  writeFileSync(paths.reportHtmlPath, generateHtmlReport(report), { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
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
    `Tool calls: ${Object.entries(meta.toolCounts || {})
      .slice(0, 8)
      .map(([name, count]) => `${name} ${count}`)
      .join(", ") || "none"}`,
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
    transcript || "No readable transcript content."
  ].join("\n");
}

function limitTurns(turns, readMode) {
  if (readMode === "deep" || turns.length <= DEFAULT_LIMITS.max_turns_per_normal_session) {
    return turns;
  }
  const head = turns.slice(0, 6);
  const tail = turns.slice(-6);
  const errorTurns = turns.filter((turn) =>
    turn.events.some((event) => event.type === "ToolResult" && event.payload?.return_value?.is_error)
  );
  return uniqueTurns([...head, ...errorTurns, ...tail]).slice(0, DEFAULT_LIMITS.max_turns_per_normal_session);
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
    max_sessions_scanned: numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned),
    max_meta_parse_sessions: numberOption(options.metaLimit, DEFAULT_LIMITS.max_meta_parse_sessions),
    max_semantic_candidates: numberOption(options.semanticLimit, DEFAULT_LIMITS.max_semantic_candidates),
    max_facet_sessions: numberOption(options.facetLimit, DEFAULT_LIMITS.max_facet_sessions),
    max_deep_transcript_sessions: numberOption(
      options.deepTranscriptLimit,
      DEFAULT_LIMITS.max_deep_transcript_sessions
    ),
    max_transcript_chars_per_deep_session: DEFAULT_LIMITS.max_transcript_chars_per_deep_session,
    max_transcript_chars_per_normal_session: DEFAULT_LIMITS.max_transcript_chars_per_normal_session,
    max_turns_per_normal_session: DEFAULT_LIMITS.max_turns_per_normal_session,
    max_friction_details: DEFAULT_LIMITS.max_friction_details,
    max_user_instruction_candidates: DEFAULT_LIMITS.max_user_instruction_candidates
  };
}

function limitAggregated(aggregated) {
  return {
    ...aggregated,
    toolCounts: topMap(aggregated.toolCounts, 15),
    toolErrorCategories: topMap(aggregated.toolErrorCategories, 10),
    languages: topMap(aggregated.languages, 15),
    projects: Object.fromEntries(Object.entries(aggregated.projects || {}).slice(0, 10)),
    goalCategories: topMap(aggregated.goalCategories, 10),
    outcomes: topMap(aggregated.outcomes, 10),
    satisfaction: topMap(aggregated.satisfaction, 10),
    helpfulness: topMap(aggregated.helpfulness, 10),
    sessionTypes: topMap(aggregated.sessionTypes, 10),
    friction: topMap(aggregated.friction, 10),
    primarySuccess: topMap(aggregated.primarySuccess, 10),
    frictionDetails: aggregated.frictionDetails.slice(0, DEFAULT_LIMITS.max_friction_details),
    sessionSummaries: aggregated.sessionSummaries.slice(0, DEFAULT_LIMITS.max_facet_sessions),
    userInstructionsToAssistant: (aggregated.userInstructionsToAssistant || []).slice(
      0,
      DEFAULT_LIMITS.max_user_instruction_candidates
    ),
    userLanguage: aggregated.userLanguage,
    timeOfDay: aggregated.timeOfDay,
    workflowSignals: aggregated.workflowSignals
  };
}

function topMap(map, limit) {
  return Object.fromEntries(Object.entries(map || {}).slice(0, limit));
}

function buildSessionSummaries(metas) {
  return metas
    .filter((meta) => !meta.isMetaSession && meta.userMessageCount > 0)
    .slice(0, DEFAULT_LIMITS.max_facet_sessions)
    .map(
      (meta) =>
        `${meta.projectPath || "unknown project"}: ${truncate(meta.firstPrompt, 180) || "no prompt"} (${meta.userMessageCount} user messages, ${meta.assistantStepCount} assistant steps)`
    );
}

function buildFrictionDetails(metas) {
  const details = [];
  for (const meta of metas.filter((item) => !item.isMetaSession)) {
    for (const [category, count] of Object.entries(meta.toolErrorCategories || {})) {
      details.push(
        `${meta.projectPath || meta.projectHash}: ${category} occurred ${count} time(s) in session ${meta.sessionId}.`
      );
    }
    if (meta.userInterruptions > 0) {
      details.push(
        `${meta.projectPath || meta.projectHash}: user interrupted ${meta.userInterruptions} time(s) in session ${meta.sessionId}.`
      );
    }
  }
  return details.slice(0, DEFAULT_LIMITS.max_friction_details);
}

function buildUserInstructions(metas) {
  const counts = new Map();
  for (const meta of metas.filter((item) => !item.isMetaSession)) {
    const prompt = truncate(meta.firstPrompt, 180).trim();
    if (!prompt) {
      continue;
    }
    const key = prompt.toLowerCase();
    counts.set(key, { instruction: prompt, count: (counts.get(key)?.count || 0) + 1 });
  }
  return Array.from(counts.values())
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, DEFAULT_LIMITS.max_user_instruction_candidates);
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
  const total = Math.max(1, counts.zh + counts.en + counts.mixed + counts.unknown);
  const confidence = code === "unknown" ? 0 : Math.round(((code === "zh" ? zhLike : enLike) / total) * 100) / 100;
  const labels = {
    zh: "natural Simplified Chinese",
    en: "natural English",
    mixed: "the user's mixed Chinese-English style",
    unknown: "the user's language"
  };
  return {
    code,
    label: labels[code],
    confidence,
    counts,
    instruction:
      code === "zh"
        ? "Use fluent Chinese for prose; keep technical identifiers and awkward section titles in English."
        : "Use clear, concise English unless the packet evidence strongly suggests otherwise."
  };
}

function classifyLanguage(text) {
  const value = String(text || "");
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
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
    prompt_intents: countTags(visible.flatMap((meta) => classifyPrompt(meta.firstPrompt))),
    feature_mentions: countFeatureMentions(visible.map((meta) => meta.firstPrompt).join("\n")),
    sessions_with_subagents: visible.filter((meta) => meta.usesSubagent).length,
    sessions_with_mcp: visible.filter((meta) => meta.usesMcp).length,
    sessions_with_web: visible.filter((meta) => meta.usesWeb).length,
    sessions_with_tool_errors: visible.filter((meta) => meta.toolErrorCount > 0).length,
    high_iteration_sessions: visible.filter((meta) => meta.assistantStepCount >= 5).length,
    git_commit_sessions: visible.filter((meta) => meta.gitCommits > 0).length,
    average_files_modified: round(
      visible.length ? visible.reduce((total, meta) => total + meta.filesModified.length, 0) / visible.length : 0
    )
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
  return topMap(Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1])), 10);
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
    insights: /insights/g
  };
  return Object.fromEntries(
    Object.entries(features)
      .map(([name, regex]) => [name, (value.match(regex) || []).length])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
  );
}

function recommendationContext() {
  return {
    kimi_cli: [
      "skills via /skill:<name>",
      "native plan mode for approval-oriented planning",
      "subagents for focused codebase exploration or independent work",
      "headless kimi --print for non-interactive one-shot tasks when appropriate"
    ],
    omk: [
      "hooks for next-turn prompt injection and workflow guardrails",
      "omk-ralph for project-local continuation until done or blocked",
      "ultrawork for autonomous multi-step execution",
      "omk-review for focused review artifacts under .omk",
      "omk insights message for bounded usage analysis without nested LLM calls"
    ],
    skill_actions: [
      "create_skill: propose a new skill only for repeated, reusable workflows",
      "update_skill: strengthen an existing skill when the pattern maps to one already installed",
      "add_hook: use for turn-level guardrails or automatic reminders",
      "add_agents_instruction: use for stable project or user preferences",
      "no_action: use when the evidence is weak or one-off"
    ]
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
        outcome: "fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear_from_transcript",
        user_satisfaction_counts: { satisfied: 1 },
        assistant_helpfulness: "unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
        session_type: "single_task|multi_task|iterative_refinement|exploration|quick_question",
        friction_counts: { wrong_approach: 1 },
        friction_detail: "One concrete sentence, or empty string.",
        primary_success: "none|fast_accurate_search|correct_code_edits|good_explanations|proactive_help|multi_file_changes|good_debugging|workflow_automation",
        brief_summary: "One sentence: what the user wanted and whether they got it.",
        user_instructions_to_assistant: ["..."],
        evidence: ["..."]
      }
    ]
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
        ambitious_workflows: "..."
      },
      project_areas: { areas: [{ name: "...", session_count: 3, description: "..." }] },
      interaction_style: { narrative: "...", key_pattern: "..." },
      what_works: { intro: "...", impressive_workflows: [{ title: "...", description: "..." }] },
      friction_analysis: {
        intro: "...",
        categories: [{ category: "...", description: "...", examples: ["...", "..."] }]
      },
      suggestions: {
        kimi_instructions_additions: [{ addition: "...", why: "...", prompt_scaffold: "..." }],
        features_to_try: [{ feature: "...", one_liner: "...", why_for_you: "...", example_code: "..." }],
        usage_patterns: [{ title: "...", suggestion: "...", detail: "...", copyable_prompt: "..." }]
      },
      on_the_horizon: {
        intro: "...",
        opportunities: [{ title: "...", whats_possible: "...", how_to_try: "...", copyable_prompt: "..." }]
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
            recommended_action: "create_skill"
          }
        ]
      }
    },
    quality: { evidence_strength: "strong|mixed|weak", omitted_sections: [], data_limits: [] }
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
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}
