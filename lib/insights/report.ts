import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { aggregateData } from "./aggregate.ts";
import { loadCached, saveCached } from "./cache.ts";
import { generateHtmlReport } from "./html.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { defaultSections, normalizeSections } from "./sections.ts";
import { readWireTurns } from "./wire.ts";

const DEFAULT_LIMITS = {
  max_sessions_scanned: 200,
  max_session_summaries: 50,
  max_friction_details: 20,
  max_user_instructions: 15
};

export function insightsPaths(env = process.env) {
  const usageDir = omkUsageDataDir(env);
  const sectionsPath = join(usageDir, "insights-sections.json");
  return {
    usageDir,
    inputPath: join(usageDir, "insights-input.json"),
    promptPath: join(usageDir, "insights-prompt.md"),
    sectionsPath,
    draftHtmlPath: join(usageDir, "report-draft.html"),
    reportHtmlPath: join(usageDir, "report.html"),
    reportJsonPath: join(usageDir, "report.json"),
    renderCommand: `omk insights render --sections ${sectionsPath}`
  };
}

export async function generateInsightsReport(options = {}) {
  return generateMetricsOnlyReport(options);
}

export async function generateMetricsOnlyReport(options = {}) {
  const env = options.env || process.env;
  const paths = insightsPaths(env);
  mkdirSync(paths.usageDir, { recursive: true });
  const { liteSessions, metas, aggregated } = buildAggregatedData(options);
  const sections = defaultSections(aggregated);
  const report = buildReport({
    env,
    paths,
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions,
    aggregated,
    sections,
    mode: "metrics-only"
  });
  writeReport(report, paths);
  return report;
}

export async function collectInsightsInput(options = {}) {
  const env = options.env || process.env;
  const paths = insightsPaths(env);
  mkdirSync(paths.usageDir, { recursive: true });
  const { liteSessions, metas, aggregated } = buildAggregatedData(options);
  const input = buildAgentInput({ env, paths, liteSessions, metas, aggregated, options });
  const draftReport = buildReport({
    env,
    paths: { ...paths, reportHtmlPath: paths.draftHtmlPath, reportJsonPath: paths.reportJsonPath },
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions,
    aggregated,
    sections: defaultSections(aggregated),
    mode: "draft"
  });
  writeFileSync(paths.inputPath, `${JSON.stringify(input, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.promptPath, buildInsightsPrompt(input), { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.draftHtmlPath, generateHtmlReport(draftReport), { encoding: "utf8", mode: 0o600 });
  return {
    ...input,
    paths,
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions
  };
}

export async function renderInsightsReport({ sectionsPath, env = process.env } = {}) {
  const paths = insightsPaths(env);
  const input = JSON.parse(readFileSync(paths.inputPath, "utf8"));
  const rawSections = readSectionsJson(sectionsPath || paths.sectionsPath);
  const sections = normalizeSections(rawSections, input.aggregated);
  const report = buildReport({
    env,
    paths,
    scannedSessions: Number(input.aggregated?.scannedSessions || input.scanned_sessions || 0),
    analyzedSessions: Number(input.aggregated?.analyzedSessions || input.analyzed_sessions || 0),
    aggregated: input.aggregated,
    sections,
    mode: "narrative"
  });
  writeReport(report, paths);
  return report;
}

function readSectionsJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid insights sections JSON at ${path}: ${error.message}`);
  }
}

function buildAggregatedData(options = {}) {
  const env = options.env || process.env;
  const limit = numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned);
  const liteSessions = scanSessions(env).slice(0, limit);
  const metas = [];
  let parsed = 0;
  for (const session of liteSessions) {
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
  aggregated.uncachedParsedSessions = parsed;
  return { liteSessions, metas, aggregated };
}

function buildAgentInput({ env, paths, metas, aggregated, options }) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "oh-my-kimicli",
    limits: {
      max_sessions_scanned: numberOption(options.limit, DEFAULT_LIMITS.max_sessions_scanned),
      max_session_summaries: numberOption(options.facetLimit, DEFAULT_LIMITS.max_session_summaries),
      max_friction_details: DEFAULT_LIMITS.max_friction_details,
      max_user_instructions: DEFAULT_LIMITS.max_user_instructions
    },
    kimi_share_dir: kimiShareDir(env),
    aggregated: limitAggregated(aggregated),
    session_summaries: buildSessionSummaryObjects(metas).slice(
      0,
      numberOption(options.facetLimit, DEFAULT_LIMITS.max_session_summaries)
    ),
    friction_details: buildFrictionDetails(metas).slice(0, DEFAULT_LIMITS.max_friction_details),
    user_instructions: buildUserInstructions(metas).slice(0, DEFAULT_LIMITS.max_user_instructions),
    render: {
      sections_path: paths.sectionsPath,
      command: paths.renderCommand
    }
  };
}

function buildInsightsPrompt(input) {
  return `OMK_INSIGHTS_INTERNAL

# OMK Insights Narrative Pass

You are the current KimiCLI agent. Generate the narrative sections for an oh-my-kimicli usage insights report.

Read the bounded JSON payload from:

${input.render.sections_path.replace(/insights-sections\.json$/, "insights-input.json")}

Write exactly one valid JSON object to:

${input.render.sections_path}

Then run:

${input.render.command}

## Rules

- Do not run \`kimi --print\`.
- Do not run bare \`omk insights\`.
- Do not scan \`~/.kimi/sessions\` manually.
- Do not paste raw transcripts into the conversation.
- Ground claims in the provided metrics and summaries.
- Use second person ("you") when describing the user's patterns.
- Prefer concrete, useful observations over generic praise.
- If evidence is weak, say so in the relevant section instead of inventing details.

## Required JSON Schema

\`\`\`json
${JSON.stringify(sectionSchemaExample(), null, 2)}
\`\`\`

## Bounded Analysis Payload

\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`
`;
}

function buildReport({ env, paths, scannedSessions, analyzedSessions, aggregated, sections, mode }) {
  return {
    generatedAt: new Date().toISOString(),
    source: "oh-my-kimicli",
    mode,
    kimiShareDir: kimiShareDir(env),
    reportHtmlPath: paths.reportHtmlPath,
    reportJsonPath: paths.reportJsonPath,
    scannedSessions,
    analyzedSessions,
    aggregated,
    sections
  };
}

function writeReport(report, paths) {
  writeFileSync(paths.reportHtmlPath, generateHtmlReport(report), { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
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
    sessionSummaries: aggregated.sessionSummaries.slice(0, DEFAULT_LIMITS.max_session_summaries),
    userInstructionsToAssistant: (aggregated.userInstructionsToAssistant || []).slice(
      0,
      DEFAULT_LIMITS.max_user_instructions
    )
  };
}

function topMap(map, limit) {
  return Object.fromEntries(Object.entries(map || {}).slice(0, limit));
}

function buildSessionSummaryObjects(metas) {
  return metas
    .filter((meta) => !meta.isMetaSession)
    .map((meta) => ({
      session_id: meta.sessionId,
      project_path: meta.projectPath,
      first_prompt: truncate(meta.firstPrompt, 240),
      user_messages: meta.userMessageCount,
      assistant_steps: meta.assistantStepCount,
      duration_minutes: round(meta.durationMinutes),
      tools: topMap(meta.toolCounts, 6),
      tool_errors: meta.toolErrorCategories,
      languages: topMap(meta.languages, 6),
      files_modified_count: meta.filesModified.length,
      lines_added: meta.linesAdded,
      lines_removed: meta.linesRemoved,
      uses_subagent: meta.usesSubagent,
      uses_mcp: meta.usesMcp,
      uses_web: meta.usesWeb
    }))
    .filter((summary) => summary.user_messages > 0);
}

function buildSessionSummaries(metas) {
  return buildSessionSummaryObjects(metas)
    .slice(0, DEFAULT_LIMITS.max_session_summaries)
    .map(
      (summary) =>
        `${summary.project_path || "unknown project"}: ${summary.first_prompt || "no prompt"} (${summary.user_messages} user messages, ${summary.assistant_steps} assistant steps)`
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
    .slice(0, DEFAULT_LIMITS.max_user_instructions);
}

function sectionSchemaExample() {
  return {
    schema_version: 1,
    at_a_glance: {
      whats_working: "...",
      whats_hindering: "...",
      quick_wins: "...",
      ambitious_workflows: "..."
    },
    project_areas: {
      areas: [{ name: "...", session_count: 3, description: "..." }]
    },
    interaction_style: { narrative: "...", key_pattern: "..." },
    what_works: {
      intro: "...",
      impressive_workflows: [{ title: "...", description: "..." }]
    },
    friction_analysis: {
      intro: "...",
      categories: [{ category: "...", description: "...", examples: ["...", "..."] }]
    },
    suggestions: {
      kimi_instructions_additions: [{ addition: "...", why: "...", prompt_scaffold: "..." }],
      features_to_try: [
        { feature: "...", one_liner: "...", why_for_you: "...", example_code: "..." }
      ],
      usage_patterns: [{ title: "...", suggestion: "...", detail: "...", copyable_prompt: "..." }]
    },
    on_the_horizon: {
      intro: "...",
      opportunities: [
        { title: "...", whats_possible: "...", how_to_try: "...", copyable_prompt: "..." }
      ]
    },
    fun_ending: { headline: "...", detail: "..." }
  };
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
