import { loadCached, saveCached } from "./cache.ts";
import { extractJsonObject, runKimiPrompt } from "./llm.ts";
import { buildTranscript } from "./transcript.ts";

const DEFAULT_FACETS = {
  underlyingGoal: "",
  goalCategories: {},
  outcome: "unclear",
  userSatisfactionCounts: {},
  assistantHelpfulness: "moderately_helpful",
  sessionType: "single_task",
  frictionCounts: {},
  frictionDetail: "",
  primarySuccess: "none",
  briefSummary: "",
  userInstructionsToAssistant: []
};

export async function getFacetsForSession(session, turns, meta, options) {
  if (options.noLlm) {
    return null;
  }
  if (!options.force) {
    const cached = loadCached("facets", session, options.env);
    if (cached && isValidFacets(cached)) {
      return cached;
    }
  }
  const transcript = buildTranscript(session, turns, meta);
  if (!transcript) {
    return null;
  }
  const prompt = buildFacetPrompt(limitTranscript(transcript));
  try {
    const raw = await runKimiPrompt(prompt, options.env);
    const parsed = normalizeFacets(extractJsonObject(raw));
    saveCached("facets", session, parsed, options.env);
    return parsed;
  } catch {
    return null;
  }
}

function buildFacetPrompt(transcript) {
  return `OMK_INSIGHTS_INTERNAL

You analyze one KimiCLI coding-agent session. RESPOND WITH ONLY A VALID JSON OBJECT.

Return this JSON shape:
{
  "underlyingGoal": "what the user was trying to accomplish",
  "goalCategories": {"category": 1},
  "outcome": "fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear",
  "userSatisfactionCounts": {"happy": 0, "satisfied": 0, "frustrated": 0},
  "assistantHelpfulness": "unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
  "sessionType": "single_task|multi_task|iterative_refinement|exploration|quick_question",
  "frictionCounts": {"specific_friction_type": 1},
  "frictionDetail": "one concrete sentence",
  "primarySuccess": "one short success type or none",
  "briefSummary": "one sentence",
  "userInstructionsToAssistant": ["notable reusable instruction"]
}

Rules:
- Count only goals explicitly requested by the user.
- Use explicit user sentiment signals only.
- Prefer concrete friction labels over generic advice.
- Do not include markdown.

Transcript:
${transcript}`;
}

function normalizeFacets(value) {
  return {
    ...DEFAULT_FACETS,
    ...value,
    goalCategories: objectOrEmpty(value.goalCategories),
    userSatisfactionCounts: objectOrEmpty(value.userSatisfactionCounts),
    frictionCounts: objectOrEmpty(value.frictionCounts),
    userInstructionsToAssistant: Array.isArray(value.userInstructionsToAssistant)
      ? value.userInstructionsToAssistant.map(String).slice(0, 10)
      : []
  };
}

export function isValidFacets(value) {
  return Boolean(value && typeof value === "object" && typeof value.outcome === "string");
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function limitTranscript(text) {
  return text.length > 30000 ? `${text.slice(0, 30000)}\n[Transcript truncated]` : text;
}
