import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { omkHomeDir } from "./paths.ts";

const PACKAGE_NAME = "@whatevertogo/oh-my-kimicli";
const LEGACY_PACKAGE_NAME = "oh-my-kimicli";
const DEFAULT_TARGET = `${PACKAGE_NAME}@latest`;
const DEFAULT_PACKAGE_MANAGER = "npm";

export function runUpdate(args = [], { env = process.env, stdout = console.log } = {}) {
  const options = parseUpdateArgs(args);
  const plan = updatePlan(options);
  if (options.dryRun) {
    stdout(formatUpdatePlan(plan));
    return { scheduled: false, plan };
  }

  if (process.platform === "win32" && !options.inProcess) {
    const scheduled = scheduleWindowsUpdate(plan, env);
    stdout([
      "oh-my-kimicli update scheduled.",
      "The updater will run after the current omk process exits.",
      `Log file: ${scheduled.logPath}`,
      "",
      "Planned steps:",
      formatUpdatePlan(plan)
    ].join("\n"));
    return { scheduled: true, plan, ...scheduled };
  }

  runPlanNow(plan);
  stdout("oh-my-kimicli update complete.");
  return { scheduled: false, plan };
}

export function parseUpdateArgs(args = []) {
  const options = {
    target: DEFAULT_TARGET,
    packageManager: DEFAULT_PACKAGE_MANAGER,
    setup: true,
    dryRun: false,
    inProcess: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--target") {
      options.target = requireValue(args[++i], "--target");
    } else if (arg.startsWith("--target=")) {
      options.target = requireValue(arg.slice("--target=".length), "--target");
    } else if (arg === "--no-setup") {
      options.setup = false;
    } else if (arg === "--manager") {
      options.packageManager = requirePackageManager(args[++i], "--manager");
    } else if (arg.startsWith("--manager=")) {
      options.packageManager = requirePackageManager(arg.slice("--manager=".length), "--manager");
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--in-process") {
      options.inProcess = true;
    } else {
      throw new Error(`Unknown update option: ${arg}`);
    }
  }
  return options;
}

function updatePlan(options) {
  const commands =
    options.packageManager === "bun"
      ? [
          ["bun", "remove", "-g", LEGACY_PACKAGE_NAME],
          ["bun", "remove", "-g", PACKAGE_NAME],
          ["bun", "install", "-g", options.target]
        ]
      : [
          ["npm", "uninstall", "-g", LEGACY_PACKAGE_NAME],
          ["npm", "uninstall", "-g", PACKAGE_NAME],
          ["npm", "install", "-g", options.target]
        ];
  if (options.setup) {
    commands.push(["omk", "setup", "--force"]);
  }
  return { target: options.target, packageManager: options.packageManager, commands };
}

function runPlanNow(plan) {
  for (const command of plan.commands) {
    const result = spawnSync(command[0], command.slice(1), {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (result.status !== 0) {
      throw new Error(`Update command failed (${result.status}): ${command.join(" ")}`);
    }
  }
}

function scheduleWindowsUpdate(plan, env) {
  const home = omkHomeDir(env);
  mkdirSync(home, { recursive: true });
  const scriptPath = join(home, "update.ps1");
  const logPath = join(home, "update.log");
  writeFileSync(scriptPath, windowsUpdateScript({ plan, logPath }), "utf8");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Process -FilePath powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${quotePowerShell(scriptPath)}) -WindowStyle Hidden`
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`Failed to schedule update: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return { scriptPath, logPath };
}

export function windowsUpdateScript({ plan, logPath }) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "Start-Sleep -Seconds 1",
    `Start-Transcript -Path ${quotePowerShell(logPath)} -Force | Out-Null`,
    `Write-Host ${quotePowerShell("oh-my-kimicli updater started at")} (Get-Date).ToString('s')`,
    `Write-Host ${quotePowerShell(`Target: ${plan.target}`)}`
  ];
  for (const command of plan.commands) {
    if (command[0] === "omk") {
      lines.push(resolveWindowsOmkCommand(plan.packageManager));
      lines.push(runPowerShellCommand(["$omk", ...command.slice(1)], { firstIsVariable: true }));
    } else {
      lines.push(runPowerShellCommand(command));
    }
  }
  lines.push(`Write-Host ${quotePowerShell("oh-my-kimicli updater finished at")} (Get-Date).ToString('s')`);
  lines.push("Stop-Transcript | Out-Null");
  return `${lines.join("\n")}\n`;
}

function resolveWindowsOmkCommand(packageManager) {
  if (packageManager === "bun") {
    return ["$globalBin = & 'bun' pm bin -g", "$omk = Join-Path $globalBin 'omk.exe'"].join("\n");
  }
  return ["$globalBin = & 'npm' prefix -g", "$omk = Join-Path $globalBin 'omk.cmd'"].join("\n");
}

function runPowerShellCommand(command, { firstIsVariable = false } = {}) {
  const executable = firstIsVariable ? command[0] : quotePowerShell(command[0]);
  const args = command.slice(1).map(quotePowerShell).join(" ");
  return [
    `Write-Host ${quotePowerShell(`> ${command.join(" ")}`)}`,
    `& ${executable}${args ? ` ${args}` : ""}`,
    "if ($LASTEXITCODE -ne 0) { throw \"Command failed with exit code $LASTEXITCODE\" }"
  ].join("\n");
}

function formatUpdatePlan(plan) {
  return plan.commands.map((command) => command.join(" ")).join("\n");
}

function requireValue(value, flag) {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function requirePackageManager(value, flag) {
  const manager = requireValue(value, flag);
  if (manager !== "npm" && manager !== "bun") {
    throw new Error(`${flag} must be "npm" or "bun"`);
  }
  return manager;
}

export function quotePowerShell(value) {
  return `'${escapePowerShell(value)}'`;
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}
