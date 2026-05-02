import { runHook } from "./hook.ts";
import { ensureConfig } from "./config.ts";
import { doctor, formatDoctorSummary, setup, uninstall } from "./setup.ts";
import { runInsightsCli } from "./insights/cli.ts";
import { runUpdate } from "./update.ts";

export async function main(args) {
  const [command = "help", ...rest] = args;
  switch (command) {
    case "setup":
      setup({ force: rest.includes("--force") });
      console.log("oh-my-kimicli setup complete.");
      console.log(formatDoctorSummary());
      return;
    case "uninstall":
      uninstall();
      console.log("oh-my-kimicli hooks, plugin, and managed skills removed.");
      return;
    case "update":
      runUpdate(rest);
      return;
    case "doctor":
      console.log(JSON.stringify(doctor(), null, 2));
      return;
    case "config":
      console.log(JSON.stringify(ensureConfig(), null, 2));
      return;
    case "insights":
      await runInsightsCli(rest);
      return;
    case "hook":
      await runHook();
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\nRun "omk help" for usage.`);
  }
}

function printHelp() {
  console.log(`oh-my-kimicli

Usage:
  omk setup [--force]     Create ~/.omk state and install plugin, skills, and hooks
  omk update              Reinstall latest GitHub version and refresh setup
  omk uninstall           Remove managed hooks, plugin, and managed skills
  omk config              Create or normalize ~/.omk/config.json
  omk doctor              Print machine-readable installation diagnostics
  omk insights prepare    Generate evidence pack for /skill:insights
  omk insights render     Render report from insights-content.json
  omk insights paths      Print insights artifact paths
  omk help                Show this help

Inside KimiCLI:
  /skill:insights         prepare evidence -> write content -> render
`);
}
