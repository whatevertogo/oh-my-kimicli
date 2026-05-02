import { generateInsightsReport } from "./report.ts";

export async function runInsightsCli(args, { env = process.env, stdout = console.log } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    stdout(insightsHelp());
    return null;
  }
  const options = parseInsightsArgs(args, env);
  const report = await generateInsightsReport(options);
  if (options.json) {
    stdout(JSON.stringify(report, null, 2));
    return report;
  }
  stdout(formatInsightsSummary(report, options));
  return report;
}

export function parseInsightsArgs(args, env = process.env) {
  const options = { env, force: false, limit: 200, facetLimit: 50, noLlm: false, json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--no-llm") {
      options.noLlm = true;
    } else if (arg === "--json") {
      options.json = true;
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

export function formatInsightsSummary(report, options = {}) {
  return [
    "oh-my-kimicli insights complete.",
    `HTML report: ${report.reportHtmlPath}`,
    `JSON report: ${report.reportJsonPath}`,
    `Sessions scanned: ${report.scannedSessions}`,
    `Sessions analyzed: ${report.analyzedSessions}`,
    `Facet sessions: ${report.aggregated.facetSessions}${options.noLlm ? " (LLM disabled)" : ""}`,
    "",
    report.sections.atAGlance
  ].join("\n");
}

export function insightsHelp() {
  return `Usage:
  omk insights [--force] [--limit N] [--facet-limit N] [--no-llm] [--json]

Inside KimiCLI:
  /skill:insights [same flags]`;
}
