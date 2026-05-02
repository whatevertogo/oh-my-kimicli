import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { aggregateData } from "./aggregate.ts";
import { loadCached, saveCached } from "./cache.ts";
import { generateHtmlReport } from "./html.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { defaultSections, normalizeSections } from "./sections.ts";
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
  let parsed = 0;
  for (const session of liteSessions) {
    let meta = options.force ? null : loadCached("session-meta", session, env);
    if (!meta) {
      const turns = readWireTurns(session.wirePath);
      const turns = readWireTurns(session.wirePath);
      meta = buildSessionMeta(session, turns);
      saveCached("session-meta", session, meta, env);
      parsed += 1;
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
    preferred_output_language: aggregated.userLanguage,
    aggregated: limitAggregated(aggregated),
    session_summaries: buildSessionSummaryObjects(metas).slice(
      0,
      numberOption(options.facetLimit, DEFAULT_LIMITS.max_session_summaries)
    ),
    friction_details: buildFrictionDetails(metas).slice(0, DEFAULT_LIMITS.max_friction_details),
    user_instructions: buildUserInstructions(metas).slice(0, DEFAULT_LIMITS.max_user_instructions),
    workflow_signals: aggregated.workflowSignals,
    time_of_day: aggregated.timeOfDay,
    recommendation_context: recommendationContext(),
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

## Output Language

Write the narrative sections in ${input.preferred_output_language.label}.
${input.preferred_output_language.instruction}
Keep command names, file paths, skill names, and product names exactly as written.

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
- Make the report useful: connect observations to specific KimiCLI/OMK capabilities in \`recommendation_context\`.
- Include "what to try next" prompts or commands where they would actually reduce repeated effort.
- Treat examples as evidence, not as raw transcript. Do not quote long session content.

## Useful Angles

- What work areas consume the most sessions or messages?
- Where does the user already work well with the agent?
- Where do tool errors, interruptions, or repeated prompts suggest friction?
- Which instructions could be moved into AGENTS.md, a skill, or an OMK hook?
- Which KimiCLI/OMK features would save the most future turns?

## Section Guidance

Write every section in the required JSON object:

- \`project_areas\`: include 4-5 areas when evidence exists. Skip OMK/Kimi internal insights work.
- \`interaction_style\`: describe how the user collaborates with KimiCLI, not just what tools were used. Use second person.
- \`what_works\`: identify 2-3 workflows that are already effective. Avoid empty praise.
- \`friction_analysis\`: include concrete categories with consequences. Separate agent-side problems from user-side/environment friction when useful.
- \`suggestions\`: recommend AGENTS.md additions, KimiCLI/OMK features, and copyable prompts only when tied to evidence.
- \`skill_opportunities\`: identify repeatable workflows that may deserve a new skill, an updated skill, a hook prompt, or an AGENTS.md instruction. Do not claim a skill should be created unless repeated usage or high future leverage supports it.
- \`on_the_horizon\`: think bigger than today's workflow, especially around subagents, Ralph, ultrawork, review loops, and bounded headless automation.
- \`fun_ending\`: pick a qualitative moment from summaries/signals. If there is no good moment, say so plainly.
- \`at_a_glance\`: write this last after considering the other sections. Keep it concise, coaching-oriented, and high level.

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
    mode,
    kimiShareDir: kimiShareDir(env),
    reportHtmlPath: paths.reportHtmlPath,
    reportJsonPath: paths.reportJsonPath,
    scannedSessions,
    analyzedSessions,
    reportHtmlPath: paths.reportHtmlPath,
    reportJsonPath: paths.reportJsonPath,
    scannedSessions,
    analyzedSessions,
    aggregated,
    sections
  };
}
}

function writeReport(report, paths) {
  writeFileSync(paths.reportHtmlPath, generateHtmlReport(report), { encoding: "utf8", mode: 0o600 });
  writeFileSync(paths.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
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
    ),
    userLanguage: aggregated.userLanguage,
    timeOfDay: aggregated.timeOfDay,
    workflowSignals: aggregated.workflowSignals
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
      prompt_language: classifyLanguage(meta.firstPrompt).label,
      workflow_tags: classifyPrompt(meta.firstPrompt),
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
        ? "Use fluent Chinese for headings and prose; keep technical identifiers such as KimiCLI, OMK, /skill:insights, hooks, Ralph, and file paths in English."
        : "Use clear, concise English unless the payload examples strongly suggest otherwise."
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
      "insights collect/render for bounded usage analysis without nested LLM calls"
    ],
    skill_actions: [
      "create_skill: propose a new skill only for repeated, reusable workflows",
      "update_skill: strengthen an existing skill when the pattern maps to one already installed",
      "add_hook: use for turn-level guardrails or automatic reminders",
      "add_agents_instruction: use for stable project or user preferences",
      "no_action: use when the evidence is weak or one-off"
    ],
    suggestion_targets: [
      "AGENTS.md additions for stable preferences",
      "new or revised skills for repeated workflows",
      "hook prompts for recurring turn-level discipline",
      "review or Ralph gates for tasks that often stop too early"
    ]
  };
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
    skill_opportunities: [
      {
        name: "...",
        trigger: "...",
        why: "...",
        evidence: ["...", "..."],
        proposed_scope: "...",
        risk: "...",
        example_prompt: "...",
        recommended_action: "create_skill"
      }
    ],
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
function truncate(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}
