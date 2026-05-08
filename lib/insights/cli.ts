import {
	collectInsightsMessage,
	generateMetricsOnlyReport,
	insightsPaths,
} from "./report.ts";

export async function runInsightsCli(
	args,
	{ env = process.env, stdout = console.log } = {},
) {
	if (args.includes("--help") || args.includes("-h")) {
		stdout(insightsHelp());
		return null;
	}

	const command = args[0] && !args[0].startsWith("-") ? args[0] : "metrics";
	const rest = command === "metrics" ? args : args.slice(1);

	if (command === "message") {
		const options = parseInsightsArgs(rest, env);
		const input = await collectInsightsMessage(options);
		stdout(formatMessageSummary(input));
		return input;
	}

	if (command === "paths") {
		const paths = insightsPaths(env);
		stdout(formatPaths(paths));
		return paths;
	}

	if (command !== "metrics") {
		throw new Error(
			`Unknown insights command: ${command}\n\n${insightsHelp()}`,
		);
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
	const options = {
		env,
		force: false,
		limit: 500,
		facetLimit: 50,
		noLlm: true,
		json: false,
	};
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
		"For a narrative report inside KimiCLI, run /skill:insights.",
	].join("\n");
}

function formatMessageSummary(input) {
	return [
		"oh-my-kimicli insights message complete.",
		`Task: ${input.paths.messagePath}`,
		`Manifest: ${input.paths.manifestPath}`,
		`Input JSON: ${input.paths.inputPath}`,
		`Session packets: ${input.paths.sessionsDir}`,
		`Facets JSON: ${input.paths.facetsPath}`,
		`Target HTML: ${input.paths.reportHtmlPath}`,
		`Target JSON: ${input.paths.reportJsonPath}`,
		`Sessions scanned: ${input.scannedSessions}`,
		`Sessions analyzed: ${input.analyzedSessions}`,
	].join("\n");
}

function formatPaths(paths) {
	return [
		`usage_data_dir: ${paths.usageDir}`,
		`insights_dir: ${paths.insightsDir}`,
		`sessions_dir: ${paths.sessionsDir}`,
		`manifest: ${paths.manifestPath}`,
		`input_json: ${paths.inputPath}`,
		`task: ${paths.messagePath}`,
		`facets_json: ${paths.facetsPath}`,
		`report_html: ${paths.reportHtmlPath}`,
		`report_json: ${paths.reportJsonPath}`,
	].join("\n");
}

export function insightsHelp() {
	return `Usage:
  omk insights [--no-llm] [--force] [--limit N] [--json]
  omk insights message [--force] [--limit N] [--facet-limit N]
  omk insights paths

Inside KimiCLI:
  /skill:insights          Generate session packets, then let the current agent write HTML/JSON

Notes:
  Bare 'omk insights' is metrics-only. It never starts nested kimi --print.
  For a narrative report, use /skill:insights inside KimiCLI.
  'collect' and 'render' were removed to avoid a second report-generation pipeline.`;
}
