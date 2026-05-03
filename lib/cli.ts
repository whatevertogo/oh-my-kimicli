import { runHook } from "./hook.ts";
import { ensureConfig } from "./config.ts";
import { doctor, formatDoctorSummary, setup, uninstall } from "./setup.ts";
import { runInsightsCli } from "./insights/cli.ts";
import { runUpdate } from "./update.ts";
import { reviewTarget } from "./review.ts";
import {
  cancelWorkflow,
  cleanWorkflow,
  formatWorkflowStatus,
  resumeWorkflow,
  workflowStatus
} from "./workflow.ts";

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
    case "status":
      console.log(formatWorkflowStatus(workflowStatus()));
      return;
    case "cancel":
      console.log(formatWorkflowStatus({ exists: true, ...cancelWorkflow() }));
      return;
    case "resume":
      console.log(formatWorkflowStatus({ exists: true, ...resumeWorkflow() }));
      return;
    case "clean":
      console.log(`Removed OMK workflow state: ${cleanWorkflow().removed}`);
      return;
    case "review-target":
      console.log(JSON.stringify(reviewTarget(), null, 2));
      return;
    case "update":
      runUpdate(rest);
      return;
    case "doctor":
      if (rest.includes("--skills")) {
        console.log(JSON.stringify(doctor().skill_status, null, 2));
        return;
      }
      console.log(JSON.stringify(doctor({ runtime: rest.includes("--runtime") }), null, 2));
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

Lifecycle:
  omk setup [--force]     Create ~/.omk state and install plugin, skills, and hooks
  omk update              Reinstall npm latest and refresh setup
  omk uninstall           Remove managed hooks, plugin, and managed skills
  omk doctor              Print machine-readable installation diagnostics
  omk doctor --runtime    Include a dry-run hook runtime check
  omk doctor --skills     Print per-skill sync status only

Project workflow:
  omk status              Show project-local OMK workflow state
  omk cancel              Mark project-local Ralph workflow as blocked
  omk resume              Mark project-local Ralph workflow as active
  omk clean               Remove project-local OMK workflow state

Pipelines:
  omk insights prepare    Generate evidence pack for /skill:insights
  omk insights render     Render report from insights-content.json
  omk insights paths      Print insights artifact paths

Helpers:
  omk config              Create or normalize ~/.omk/config.json
  omk review-target       Print JSON describing the current review target
  omk hook                Internal KimiCLI hook entrypoint
  omk help                Show this help

Inside KimiCLI:
  /skill:insights         prepare evidence -> write content -> render
`);
}
