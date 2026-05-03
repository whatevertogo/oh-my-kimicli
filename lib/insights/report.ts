import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.ts";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { redactJson } from "../redact.ts";
import { aggregateData } from "./aggregate.ts";
import { loadCached, saveCached } from "./cache.ts";
import { generateHtmlReport } from "./html.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { buildTranscript } from "./transcript.ts";
import { readWireTurns } from "./wire.ts";

const DEFAULT_LIMITS = {
  max_sessions_scanned: 500,
  max_meta_sessions: 300,
  max_facet_sessions: 50,
  max_deep_sessions: 20,
  max_excerpts_per_deep_session: 12,
  max_chars_per_deep_session: 12000,
  max_chars_per_normal_session: 4000,
  max_total_evidence_chars: 90000,
  max_friction_details: 30,
  max_user_instruction_candidates: 25
};

type AnyRecord = Record<string, any>;

export function insightsPaths(env = process.env) {
  const usageDir = omkUsageDataDir(env);
  const insightsDir = join(usageDir, "insights");
  return {
    usageDir,
    insightsDir,
    evidenceMarkdownPath: join(insightsDir, "evidence-pack.md"),
    evidenceJsonPath: join(insightsDir, "evidence-pack.json"),
    schemaPath: join(insightsDir, "insights-content.schema.json"),
    contentPath: join(insightsDir, "insights-content.json"),
    reportHtmlPath: join(insightsDir, "report.html"),
    reportJsonPath: join(insightsDir, "report.json")
  };
}

export async function prepareInsightsEvidence(options: AnyRecord = {}) {
  const env = options.env || process.env;
  const paths = insightsPaths(env);
  mkdirSync(paths.insightsDir, { recursive: true });

  const { liteSessions, metas, sessionInputs, aggregated } = buildAggregatedData(options);
  const evidence = redactJson(
    buildEvidencePack({
      env,
      paths,
      scannedSessions: liteSessions.length,
      sessionInputs,
      aggregated,
      options
    }),
    readConfig(env).config.privacy
  );

  writeFileSync(paths.evidenceJsonPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  writeFileSync(paths.schemaPath, `${JSON.stringify(insightsContentSchema(), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  writeFileSync(paths.evidenceMarkdownPath, renderEvidenceMarkdown(evidence), {
    encoding: "utf8",
    mode: 0o600
  });

  return {
    ...evidence,
    fsPaths: paths,
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions
  };
}

export async function renderInsightsReport({ env = process.env }: AnyRecord = {}) {
  const paths = insightsPaths(env);
  const evidence = readJson(paths.evidenceJsonPath, "evidence pack");
  const content = normalizeInsightsContent(readJson(paths.contentPath, "insights content"));
  const report = {
    schema_version: 2,
    generatedAt: new Date().toISOString(),
    source: "oh-my-kimicli",
    mode: "narrative",
    language: content.language || evidence.preferred_output_language?.code || "unknown",
    kimiShareDir: evidence.kimi_share_dir,
    reportHtmlPath: paths.reportHtmlPath,
    reportJsonPath: paths.reportJsonPath,
    scannedSessions: evidence.scanned_sessions,
    analyzedSessions: evidence.analyzed_sessions,
    metrics: evidence.aggregate_metrics,
    aggregated: evidence.aggregate_metrics,
    facets_summary: summarizeFacets(content.facets),
    facets: content.facets,
    sections: content.sections,
    quality: content.quality
  };
  writeFileSync(paths.reportHtmlPath, generateHtmlReport(report), { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return report;
}

function buildAggregatedData(options: AnyRecord = {}) {
  const env = options.env || process.env;
  const limit = numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned);
  const metaLimit = numberOption(options.metaLimit, DEFAULT_LIMITS.max_meta_sessions);
  const liteSessions = scanSessions(env).slice(0, limit);
  const metas = [];
  const sessionInputs = [];
  let parsed = 0;

  for (const session of liteSessions.slice(0, metaLimit)) {
    const turns = readWireTurns(session.wirePath);
    let meta = options.force ? null : loadCached("session-meta", session, env);
    if (!meta) {
      meta = buildSessionMeta(session, turns);
      saveCached("session-meta", session, meta, env);
      parsed += 1;
    }
    metas.push(meta);
    sessionInputs.push({ session, turns, meta });
  }

  const visibleMetas = metas.filter((meta) => !meta.isMetaSession && !isInsightsSession(meta));
  const aggregated = aggregateData(visibleMetas, []);
  aggregated.scannedSessions = liteSessions.length;
  aggregated.sessionSummaries = buildSessionSummaries(visibleMetas);
  aggregated.frictionDetails = buildFrictionDetails(visibleMetas);
  aggregated.userInstructionsToAssistant = buildUserInstructions(visibleMetas);
  aggregated.userLanguage = buildLanguageProfile(visibleMetas);
  aggregated.timeOfDay = buildTimeOfDay(visibleMetas);
  aggregated.workflowSignals = buildWorkflowSignals(visibleMetas);
  aggregated.uncachedParsedSessions = parsed;

  return { liteSessions, metas, sessionInputs, aggregated };
}

function buildEvidencePack({ env, paths, scannedSessions, sessionInputs, aggregated, options }: AnyRecord) {
  const candidates = sessionInputs
    .filter(({ meta }) => !meta.isMetaSession && !isInsightsSession(meta) && meta.userMessageCount > 0)
    .map((entry) => ({ ...entry, score: scoreSession(entry.meta) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, numberOption(options.facetLimit, DEFAULT_LIMITS.max_facet_sessions));
  const deepLimit = Math.min(DEFAULT_LIMITS.max_deep_sessions, candidates.length);
  const sessionEvidence = [];
  let usedChars = 0;
  for (const [index, entry] of candidates.entries()) {
    const mode = index < deepLimit ? "deep" : "normal";
    const charLimit =
      mode === "deep" ? DEFAULT_LIMITS.max_chars_per_deep_session : DEFAULT_LIMITS.max_chars_per_normal_session;
    const transcript = buildTranscript(entry.session, limitTurns(entry.turns, mode), entry.meta);
    const excerpt = truncateBlock(
      transcript,
      Math.min(charLimit, DEFAULT_LIMITS.max_total_evidence_chars - usedChars)
    );
    if (!excerpt) {
      continue;
    }
    usedChars += excerpt.length;
    sessionEvidence.push({
      session_id: entry.meta.sessionId,
      project_path: entry.meta.projectPath,
      score: entry.score,
      read_mode: mode,
      why_selected: selectionReasons(entry.meta),
      first_prompt: truncate(entry.meta.firstPrompt, 400),
      user_messages: entry.meta.userMessageCount,
      assistant_steps: entry.meta.assistantStepCount,
      tool_counts: topMap(entry.meta.toolCounts, 8),
      tool_errors: entry.meta.toolErrorCategories,
      files_modified: entry.meta.filesModified.slice(0, 30),
      workflow_tags: classifyPrompt(entry.meta.firstPrompt),
      excerpt
    });
    if (usedChars >= DEFAULT_LIMITS.max_total_evidence_chars) {
      break;
    }
  }

  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    source: "oh-my-kimicli",
    kimi_share_dir: kimiShareDir(env),
    scanned_sessions: scannedSessions,
    analyzed_sessions: aggregated.analyzedSessions,
    preferred_output_language: aggregated.userLanguage,
    limits: effectiveLimits(options),
    paths: {
      evidence_markdown: paths.evidenceMarkdownPath,
      evidence_json: paths.evidenceJsonPath,
      schema: paths.schemaPath,
      content: paths.contentPath,
      report_html: paths.reportHtmlPath,
      report_json: paths.reportJsonPath
    },
    aggregate_metrics: limitAggregated(aggregated),
    session_evidence: sessionEvidence,
    friction_details: (aggregated.frictionDetails || []).slice(0, DEFAULT_LIMITS.max_friction_details),
    repeated_user_instructions: (aggregated.userInstructionsToAssistant || []).slice(
      0,
      DEFAULT_LIMITS.max_user_instruction_candidates
    ),
    feature_reference: recommendationContext(),
    meta_filtered: {
      insights_sessions_excluded: sessionInputs.filter(({ meta }) => isInsightsSession(meta)).length,
      candidate_sessions: candidates.length,
      evidence_chars: usedChars
    }
  };
}

function renderEvidenceMarkdown(evidence: AnyRecord) {
  return [
    "OMK_INSIGHTS_INTERNAL",
    "",
    "# OMK Insights Evidence Pack",
    "",
    "You are the current KimiCLI agent. Use this evidence pack to produce structured insights content. Do not write HTML.",
    "",
    "## Output Contract",
    "",
    `Write exactly one JSON object to \`${evidence.paths.content}\`.`,
    `Then run \`omk insights render\` to generate \`${evidence.paths.report_html}\` and \`${evidence.paths.report_json}\`.`,
    "",
    "Do not run removed quick-report flags, `kimi --print`, or scan `~/.kimi/sessions` manually.",
    "",
    "## Claude Code Style Analysis Order",
    "",
    "1. Extract session facets from the session evidence.",
    "2. Aggregate the facets into project areas, interaction style, what works, friction, suggestions, and future opportunities.",
    "3. Write At a Glance last from the finished section judgments.",
    "4. Remove generic advice that is not supported by the evidence.",
    "5. Leave skill opportunities empty unless repeated usage, clear friction, or high leverage is visible.",
    "",
    "## Language",
    "",
    `Detected preference: ${evidence.preferred_output_language.label}.`,
    evidence.preferred_output_language.instruction,
    "Use the user's natural language for prose. Keep KimiCLI, OMK, hooks, skills, subagents, Ralph, ultrawork, commands, and paths in English when clearer.",
    "",
    "## Required JSON Schema",
    "",
    "```json",
    JSON.stringify(insightsContentSchema(), null, 2),
    "```",
    "",
    "## Summary Metrics",
    "",
    fencedJson(evidence.aggregate_metrics),
    "",
    "## Friction Details",
    "",
    bulletList(evidence.friction_details),
    "",
    "## Repeated User Instructions",
    "",
    bulletList(evidence.repeated_user_instructions.map((item) => `${item.instruction} (${item.count}x)`)),
    "",
    "## KimiCLI / OMK Feature Reference",
    "",
    fencedJson(evidence.feature_reference),
    "",
    "## Session Evidence",
    "",
    ...evidence.session_evidence.map(renderSessionEvidence),
    "",
    "## Final Response",
    "",
    "After rendering, report only the HTML path, JSON path, sessions scanned/analyzed, weak evidence notes, and one short question about creating/updating a skill/hook/AGENTS.md only when `skill_opportunities.candidates` contains a concrete action."
  ].join("\n");
}

function renderSessionEvidence(session: AnyRecord, index: number) {
  return [
    `### Session ${index + 1}: ${session.session_id}`,
    "",
    `Project: ${session.project_path || "unknown"}`,
    `Score: ${session.score}`,
    `Read mode: ${session.read_mode}`,
    `Why selected: ${session.why_selected.join(", ")}`,
    `Workflow tags: ${session.workflow_tags.join(", ")}`,
    `First prompt: ${session.first_prompt || "none"}`,
    `Tool counts: ${JSON.stringify(session.tool_counts)}`,
    `Tool errors: ${JSON.stringify(session.tool_errors)}`,
    `Files modified: ${session.files_modified.join(", ") || "none"}`,
    "",
    "```text",
    session.excerpt,
    "```",
    ""
  ].join("\n");
}

function normalizeInsightsContent(value: any) {
  if (!isObject(value)) {
    throw new Error("insights content must be a JSON object");
  }
  validateInsightsContent(value);
  const sections = isObject(value.sections) ? value.sections : {};
  return {
    schema_version: 1,
    language: text(value.language, "unknown"),
    facets: Array.isArray(value.facets) ? value.facets : [],
    sections: {
      at_a_glance: object(sections.at_a_glance),
      project_areas: object(sections.project_areas),
      interaction_style: object(sections.interaction_style),
      what_works: object(sections.what_works),
      friction_analysis: object(sections.friction_analysis),
      suggestions: object(sections.suggestions),
      on_the_horizon: object(sections.on_the_horizon),
      skill_opportunities: object(sections.skill_opportunities)
    },
    quality: object(value.quality)
  };
}

function validateInsightsContent(value: any) {
  const errors = [];
  if (value.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }
  if (!text(value.language, "")) {
    errors.push("language is required");
  }
  if (!Array.isArray(value.facets)) {
    errors.push("facets must be an array");
  }
  const sections = isObject(value.sections) ? value.sections : {};
  for (const [sectionName, keys] of Object.entries({
    at_a_glance: ["whats_working", "whats_hindering", "quick_wins", "ambitious_workflows"],
    project_areas: ["areas"],
    interaction_style: ["narrative", "key_pattern"],
    what_works: ["intro", "impressive_workflows"],
    friction_analysis: ["intro", "categories"],
    suggestions: ["kimi_instructions_additions", "features_to_try", "usage_patterns"],
    on_the_horizon: ["intro", "opportunities"],
    skill_opportunities: ["candidates"]
  })) {
    const section = sections[sectionName];
    if (!isObject(section)) {
      errors.push(`sections.${sectionName} must be an object`);
      continue;
    }
    for (const key of keys) {
      if (!(key in section)) {
        errors.push(`sections.${sectionName}.${key} is required`);
      }
    }
  }
  const quality = isObject(value.quality) ? value.quality : {};
  if (!["strong", "mixed", "weak"].includes(String(quality.evidence_strength || ""))) {
    errors.push("quality.evidence_strength must be strong|mixed|weak");
  }
  if (errors.length > 0) {
    throw new Error(`insights-content.json invalid:\n- ${errors.join("\n- ")}`);
  }
}

function insightsContentSchema() {
  return {
    schema_version: 1,
    language: "zh-CN",
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
    ],
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
            recommended_action: "create_skill|update_skill|add_hook|add_agents_instruction|no_action"
          }
        ]
      }
    },
    quality: { evidence_strength: "strong|mixed|weak", omitted_sections: [], data_limits: [] }
  };
}

function summarizeFacets(facets: any[]) {
  const summary = {
    total: Array.isArray(facets) ? facets.length : 0,
    goal_categories: {},
    outcomes: {},
    satisfaction: {},
    friction: {}
  };
  for (const facet of Array.isArray(facets) ? facets : []) {
    addMap(summary.goal_categories, facet.goal_categories);
    increment(summary.outcomes, facet.outcome);
    addMap(summary.satisfaction, facet.user_satisfaction_counts);
    addMap(summary.friction, facet.friction_counts);
  }
  return summary;
}

function buildSessionSummaries(metas: AnyRecord[]) {
  return metas
    .filter((meta) => !meta.isMetaSession && !isInsightsSession(meta))
    .slice(0, DEFAULT_LIMITS.max_facet_sessions)
    .map(
      (meta) =>
        `${meta.projectPath || "unknown project"}: ${truncate(meta.firstPrompt, 180) || "no prompt"} (${meta.userMessageCount} user messages, ${meta.assistantStepCount} assistant steps)`
    );
}

function buildFrictionDetails(metas: AnyRecord[]) {
  const details = [];
  for (const meta of metas.filter((item) => !item.isMetaSession && !isInsightsSession(item))) {
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

function buildUserInstructions(metas: AnyRecord[]) {
  const counts = new Map();
  for (const meta of metas.filter((item) => !item.isMetaSession && !isInsightsSession(item))) {
    for (const prompt of instructionCandidates(meta)) {
      const key = prompt.toLowerCase();
      counts.set(key, { instruction: prompt, count: (counts.get(key)?.count || 0) + 1 });
    }
  }
  return Array.from(counts.values())
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, DEFAULT_LIMITS.max_user_instruction_candidates);
}

function instructionCandidates(meta: AnyRecord) {
  const prompts = Array.isArray(meta.userInputs) && meta.userInputs.length ? meta.userInputs : [meta.firstPrompt];
  const patterns = [
    /用中文/,
    /不要.*(?:废话|解释太多)/,
    /直接.*(?:做|改|执行)/,
    /先.*(?:看代码|读文件|检查)/,
    /继续/,
    /不要.*问/,
    /给我.*(?:建议|方案|代码)/
  ];
  return prompts
    .map((prompt) => truncate(prompt, 180).trim())
    .filter(Boolean)
    .filter((prompt) => prompt.length <= 180 || patterns.some((pattern) => pattern.test(prompt)))
    .filter((prompt) => patterns.some((pattern) => pattern.test(prompt)) || prompt.split(/\s+/).length <= 12);
}

function buildLanguageProfile(metas: AnyRecord[]) {
  const counts = { zh: 0, en: 0, mixed: 0, unknown: 0 };
  for (const meta of metas.filter((item) => !item.isMetaSession && !isInsightsSession(item))) {
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
        : "Use clear, concise English unless the evidence strongly suggests otherwise."
  };
}

function buildTimeOfDay(metas: AnyRecord[]) {
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const meta of metas.filter((item) => !item.isMetaSession && !isInsightsSession(item))) {
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

function buildWorkflowSignals(metas: AnyRecord[]) {
  const visible = metas.filter((item) => !item.isMetaSession && !isInsightsSession(item));
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

function limitTurns(turns: AnyRecord[], mode: string) {
  const visible = turns.filter((turn) => !turn.internal);
  if (mode === "deep") {
    return visible;
  }
  const head = visible.slice(0, 5);
  const tail = visible.slice(-5);
  const errorTurns = visible.filter((turn) =>
    turn.events.some((event) => event.type === "ToolResult" && event.payload?.return_value?.is_error)
  );
  return uniqueTurns([...head, ...errorTurns, ...tail]).slice(0, DEFAULT_LIMITS.max_excerpts_per_deep_session);
}

function uniqueTurns(turns: AnyRecord[]) {
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

function scoreSession(meta: AnyRecord) {
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

function selectionReasons(meta: AnyRecord) {
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

function isInsightsSession(meta: AnyRecord) {
  return /(^|\s)\/?skill:insights\b|^omk insights\b|OMK_INSIGHTS_INTERNAL/i.test(meta.firstPrompt || "");
}

function effectiveLimits(options: AnyRecord = {}) {
  return {
    max_sessions_scanned: numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned),
    max_meta_sessions: numberOption(options.metaLimit, DEFAULT_LIMITS.max_meta_sessions),
    max_facet_sessions: numberOption(options.facetLimit, DEFAULT_LIMITS.max_facet_sessions),
    max_deep_sessions: DEFAULT_LIMITS.max_deep_sessions,
    max_excerpts_per_deep_session: DEFAULT_LIMITS.max_excerpts_per_deep_session,
    max_chars_per_deep_session: DEFAULT_LIMITS.max_chars_per_deep_session,
    max_chars_per_normal_session: DEFAULT_LIMITS.max_chars_per_normal_session,
    max_total_evidence_chars: DEFAULT_LIMITS.max_total_evidence_chars
  };
}

function limitAggregated(aggregated: AnyRecord) {
  return {
    ...aggregated,
    toolCounts: topMap(aggregated.toolCounts, 15),
    toolErrorCategories: topMap(aggregated.toolErrorCategories, 10),
    languages: topMap(aggregated.languages, 15),
    projects: Object.fromEntries(Object.entries(aggregated.projects || {}).slice(0, 10)),
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
      "omk insights prepare/render for Claude Code style insights without nested LLM calls"
    ],
    suggestion_targets: [
      "AGENTS.md additions for stable preferences",
      "new or revised skills for repeated workflows",
      "hook prompts for recurring turn-level discipline",
      "review or Ralph gates for tasks that often stop too early"
    ]
  };
}

function readJson(path: string, label: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${label} at ${path}: ${error.message}`);
  }
}

function addMap(target: AnyRecord, source: AnyRecord) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function increment(target: AnyRecord, key: string) {
  if (key) {
    target[key] = (target[key] || 0) + 1;
  }
}

function fencedJson(value: any) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function bulletList(items: any[]) {
  return items && items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function object(value: any) {
  return isObject(value) ? value : {};
}

function text(value: any, fallback: string) {
  const string = String(value ?? "").trim();
  return string || fallback;
}

function isObject(value: any) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function topMap(map: AnyRecord, limit: number) {
  return Object.fromEntries(Object.entries(map || {}).slice(0, limit));
}

function classifyPrompt(prompt: any) {
  const textValue = String(prompt || "").toLowerCase();
  const tags = [];
  if (/review|code review|审查|检查|看看|有无/.test(textValue)) {
    tags.push("review");
  }
  if (/fix|bug|修复|报错|问题|失败/.test(textValue)) {
    tags.push("debug_fix");
  }
  if (/implement|write|add|create|实现|写|新增|做一个|生成/.test(textValue)) {
    tags.push("implementation");
  }
  if (/plan|方案|计划|设计|架构|怎么写|如何/.test(textValue)) {
    tags.push("planning");
  }
  if (/继续|直接|autonomous|ralph|ultrawork|完成/.test(textValue)) {
    tags.push("autonomous_execution");
  }
  return tags.length ? tags : ["general"];
}

function countTags(tags: string[]) {
  const out: AnyRecord = {};
  for (const tag of tags) {
    out[tag] = (out[tag] || 0) + 1;
  }
  return topMap(Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1])), 10);
}

function countFeatureMentions(input: any) {
  const value = String(input || "").toLowerCase();
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
      .map(([name, regex]) => [name, (value.match(regex) || []).length] as [string, number])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
  );
}

function classifyLanguage(input: any) {
  const value = String(input || "");
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (cjk >= 2 && latin >= 6) {
    return { code: "mixed" };
  }
  if (cjk >= 2) {
    return { code: "zh" };
  }
  if (latin >= 3) {
    return { code: "en" };
  }
  return { code: "unknown" };
}

function numberOption(value: any, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function truncate(value: any, max: number) {
  const valueText = String(value || "").replace(/\s+/g, " ").trim();
  return valueText.length > max ? `${valueText.slice(0, max - 1)}...` : valueText;
}

function truncateBlock(value: any, max: number) {
  const valueText = String(value || "").trim();
  if (max <= 0) {
    return "";
  }
  return valueText.length > max ? `${valueText.slice(0, Math.max(0, max - 1)).trimEnd()}...` : valueText;
}

function round(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}
