import {
  collectInsightsInput,
  generateMetricsOnlyReport,
  insightsPaths,
  renderInsightsReport
} from "./report.ts";

export async function runInsightsCli(args, { env = process.env, stdout = console.log } = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    stdout(insightsHelp());
    return null;
  }

  const command = args[0] && !args[0].startsWith("-") ? args[0] : "metrics";
  const rest = command === "metrics" ? args : args.slice(1);

  if (command === "collect") {
    const options = parseInsightsArgs(rest, env);
    const input = await collectInsightsInput(options);
    stdout(formatCollectSummary(input, options));
    return input;
  }

  if (command === "render") {
    const options = parseRenderArgs(rest, env);
    const report = await renderInsightsReport(options);
    stdout(formatRenderSummary(report));
    return report;
  }

  if (command === "paths") {
    const paths = insightsPaths(env);
    stdout(formatPaths(paths));
    return paths;
  }

  if (command !== "metrics") {
    throw new Error(`Unknown insights command: ${command}\n\n${insightsHelp()}`);
  }

  const options = parseInsightsArgs(rest, env);
  const report = await generateMetricsOnlyReport(options);
  if (options.json) {
    stdout(JSON.stringify(report, null, 2));
    return report;
  }
  stdout(formatInsightsSummary(report));
  return report;
}

export function parseInsightsArgs(args, env = process.env) {
  const options = { env, force: false, limit: 200, facetLimit: 50, noLlm: true, json: false };
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

export function formatInsightsSummary(report) {
  return [
    "oh-my-kimicli insights metrics report complete.",
    `HTML report: ${report.reportHtmlPath}`,
    `JSON report: ${report.reportJsonPath}`,
    `Sessions scanned: ${report.scannedSessions}`,
    `Sessions analyzed: ${report.analyzedSessions}`,
    "Narrative sections were skipped.",
    "For a narrative report inside KimiCLI, run /skill:insights."
  ].join("\n");
}

function parseRenderArgs(args, env) {
  const options = { env, sectionsPath: "" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--sections") {
      options.sectionsPath = args[++i];
    } else if (arg.startsWith("--sections=")) {
      options.sectionsPath = arg.slice("--sections=".length);
    } else {
      throw new Error(`Unknown insights render option: ${arg}\n\n${insightsHelp()}`);
    }
  }
  if (!options.sectionsPath) {
    options.sectionsPath = insightsPaths(env).sectionsPath;
  }
  return options;
}

function formatCollectSummary(input) {
  return [
    "oh-my-kimicli insights collect complete.",
    `Input JSON: ${input.paths.inputPath}`,
    `Prompt: ${input.paths.promptPath}`,
    `Draft HTML: ${input.paths.draftHtmlPath}`,
    `Sections JSON: ${input.paths.sectionsPath}`,
    `Render command: ${input.paths.renderCommand}`,
    `Sessions scanned: ${input.scannedSessions}`,
    `Sessions analyzed: ${input.analyzedSessions}`
  ].join("\n");
}

function formatRenderSummary(report) {
  return [
    "oh-my-kimicli insights render complete.",
    `HTML report: ${report.reportHtmlPath}`,
    `JSON report: ${report.reportJsonPath}`,
    `Sessions scanned: ${report.scannedSessions}`,
    `Sessions analyzed: ${report.analyzedSessions}`
  ].join("\n");
}

function formatPaths(paths) {
  return [
    `usage_data_dir: ${paths.usageDir}`,
    `input_json: ${paths.inputPath}`,
    `prompt: ${paths.promptPath}`,
    `sections_json: ${paths.sectionsPath}`,
    `draft_html: ${paths.draftHtmlPath}`,
    `report_html: ${paths.reportHtmlPath}`,
    `report_json: ${paths.reportJsonPath}`,
    `render_command: ${paths.renderCommand}`
  ].join("\n");
}

export function insightsHelp() {
  return `Usage:
  omk insights [--no-llm] [--force] [--limit N] [--json]
  omk insights collect [--force] [--limit N] [--facet-limit N]
  omk insights render --sections <path>
  omk insights paths

Inside KimiCLI:
  /skill:insights          Collect input, let the current agent write sections, then render

Notes:
  Bare 'omk insights' is metrics-only. It never starts nested kimi --print.
  For a narrative report, use /skill:insights inside KimiCLI.`;
}
