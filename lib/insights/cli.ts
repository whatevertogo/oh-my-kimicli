import { insightsPaths, prepareInsightsEvidence, renderInsightsReport } from "./report.ts";

export async function runInsightsCli(args, { env = process.env, stdout = console.log } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    stdout(insightsHelp());
    return null;
  }

  const command = args[0] && !args[0].startsWith("-") ? args[0] : "prepare";
  const rest = command === "prepare" ? (args[0]?.startsWith("-") ? args : args.slice(1)) : args.slice(1);

  if (command === "prepare") {
    const evidence = await prepareInsightsEvidence(parsePrepareArgs(rest, env));
    stdout(formatPrepareSummary(evidence));
    return evidence;
  }

  if (command === "render") {
    const report = await renderInsightsReport({ env });
    stdout(formatRenderSummary(report));
    return report;
  }

  if (command === "paths") {
    const paths = insightsPaths(env);
    stdout(formatPaths(paths));
    return paths;
  }

  throw new Error(`Unknown insights command: ${command}\n\n${insightsHelp()}`);
}

export function parsePrepareArgs(args, env = process.env) {
  const options = { env, force: false, limit: 500, facetLimit: 50 };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--limit") {
      options.limit = Number(args[++i]);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--facet-limit") {
      options.facetLimit = Number(args[++i]);
    } else if (arg.startsWith("--facet-limit=")) {
      options.facetLimit = Number(arg.slice("--facet-limit=".length));
    } else {
      throw new Error(`Unknown insights option: ${arg}\n\n${insightsHelp()}`);
    }
  }
  return options;
}

function formatPrepareSummary(evidence) {
  return [
    "oh-my-kimicli insights evidence pack ready.",
    `Evidence pack: ${evidence.paths.evidence_markdown}`,
    `Evidence JSON: ${evidence.paths.evidence_json}`,
    `Content schema: ${evidence.paths.schema}`,
    `Write content JSON: ${evidence.paths.content}`,
    `Render command: omk insights render`,
    `Target HTML: ${evidence.paths.report_html}`,
    `Target JSON: ${evidence.paths.report_json}`,
    `Sessions scanned: ${evidence.scannedSessions}`,
    `Sessions analyzed: ${evidence.analyzedSessions}`,
    `Evidence sessions: ${evidence.session_evidence.length}`
  ].join("\n");
}

function formatRenderSummary(report) {
  return [
    "oh-my-kimicli insights report rendered.",
    `HTML report: ${report.reportHtmlPath}`,
    `JSON report: ${report.reportJsonPath}`,
    `Sessions scanned: ${report.scannedSessions}`,
    `Sessions analyzed: ${report.analyzedSessions}`,
    `Facet sessions: ${report.facets_summary.total}`
  ].join("\n");
}

function formatPaths(paths) {
  return [
    `usage_data_dir: ${paths.usageDir}`,
    `insights_dir: ${paths.insightsDir}`,
    `evidence_pack: ${paths.evidenceMarkdownPath}`,
    `evidence_json: ${paths.evidenceJsonPath}`,
    `content_schema: ${paths.schemaPath}`,
    `content_json: ${paths.contentPath}`,
    `report_html: ${paths.reportHtmlPath}`,
    `report_json: ${paths.reportJsonPath}`
  ].join("\n");
}

export function insightsHelp() {
  return `Usage:
  omk insights prepare [--force] [--limit N] [--facet-limit N]
  omk insights render
  omk insights paths

Inside KimiCLI:
  /skill:insights          prepare evidence -> write insights-content.json -> render

Notes:
  Bare 'omk insights' is an alias for 'omk insights prepare'.
  There is no quick report. Narrative content comes from the current Kimi agent.
  The external CLI never starts nested kimi --print.`;
}
