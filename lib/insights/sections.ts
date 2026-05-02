import { extractJsonObject, runKimiPrompt } from "./llm.ts";

const SECTION_KEYS = [
  "projectAreas",
  "interactionStyle",
  "whatWorks",
  "frictionAnalysis",
  "suggestions",
  "onTheHorizon",
  "funEnding"
];

export async function generateSections(aggregated, options) {
  if (options.noLlm || aggregated.facetSessions === 0) {
    return deterministicSections(aggregated);
  }
  const context = JSON.stringify(
    {
      metrics: aggregated,
      summaries: aggregated.sessionSummaries.slice(0, 30),
      friction: aggregated.frictionDetails.slice(0, 15)
    },
    null,
    2
  );

  const entries = await Promise.all(
    SECTION_KEYS.map(async (key) => {
      try {
        const raw = await runKimiPrompt(sectionPrompt(key, context), options.env);
        const parsed = extractJsonObject(raw);
        return [key, String(parsed.text || "")];
      } catch {
        return [key, ""];
      }
    })
  );
  const sections = { ...deterministicSections(aggregated), ...Object.fromEntries(entries) };
  try {
    const raw = await runKimiPrompt(atAGlancePrompt(context, sections), options.env);
    const parsed = extractJsonObject(raw);
    sections.atAGlance = String(parsed.text || sections.atAGlance);
  } catch {
    // Keep deterministic fallback.
  }
  return sections;
}

function deterministicSections(data) {
  const topProject = Object.keys(data.projects)[0] || "your KimiCLI sessions";
  const topTool = Object.keys(data.toolCounts)[0] || "tools";
  return {
    atAGlance: `Scanned ${data.scannedSessions} sessions and analyzed ${data.analyzedSessions}. Most activity centers on ${topProject}. Top tool: ${topTool}.`,
    projectAreas: renderMap(data.projects, (value) => `${value.sessions} sessions, ${value.messages} messages`),
    interactionStyle: `Average response time: ${formatSeconds(data.averageResponseSeconds)}. Active days: ${data.daysActive}.`,
    whatWorks: renderMap(data.primarySuccess) || "No LLM-derived success patterns yet.",
    frictionAnalysis: renderMap(data.friction) || renderMap(data.toolErrorCategories) || "No major friction pattern found in metrics-only mode.",
    suggestions: "Run without --no-llm for narrative suggestions, or lower cost with --facet-limit 10.",
    onTheHorizon: "Use recurring insights reports to tune skills, hooks, and project instructions.",
    funEnding: "No LLM-generated ending in metrics-only mode."
  };
}

function sectionPrompt(section, context) {
  return `OMK_INSIGHTS_INTERNAL

RESPOND WITH ONLY A VALID JSON OBJECT: {"text": "..."}.

Write the "${section}" section for an oh-my-kimicli usage insights report.
Use second person ("you"), be concrete, and avoid generic praise.

Data:
${context}`;
}

function atAGlancePrompt(context, sections) {
  return `OMK_INSIGHTS_INTERNAL

RESPOND WITH ONLY A VALID JSON OBJECT: {"text": "..."}.

Write a concise At a Glance summary for this KimiCLI usage report.
Ground it in the metrics and generated sections.

Data:
${context}

Sections:
${JSON.stringify(sections, null, 2)}`;
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
