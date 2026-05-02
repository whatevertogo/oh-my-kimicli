import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { omkHomeDir } from "./paths.ts";

const DEFAULT_TARGET = "github:whatevertogo/oh-my-kimicli#main";

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
  const commands = [
    ["bun", "remove", "-g", "oh-my-kimicli"],
    ["bun", "install", "-g", options.target]
  ];
  if (options.setup) {
    commands.push(["omk", "setup", "--force"]);
  }
  return { target: options.target, commands };
}

function runPlanNow(plan) {
  for (const command of plan.commands) {
    const result = Bun.spawnSync({
      cmd: command,
      stdout: "inherit",
      stderr: "inherit"
    });
    if (result.exitCode !== 0) {
      throw new Error(`Update command failed (${result.exitCode}): ${command.join(" ")}`);
    }
  }
}

function scheduleWindowsUpdate(plan, env) {
  const home = omkHomeDir(env);
  mkdirSync(home, { recursive: true });
  const scriptPath = join(home, "update.ps1");
  const logPath = join(home, "update.log");
  const bunExe = process.execPath;
  writeFileSync(scriptPath, windowsUpdateScript({ bunExe, plan, logPath }), "utf8");
  const result = Bun.spawnSync({
    cmd: [
      "powershell",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Process -FilePath powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${escapePowerShell(scriptPath)}') -WindowStyle Hidden`
    ],
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to schedule update: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return { scriptPath, logPath };
}

function windowsUpdateScript({ bunExe, plan, logPath }) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "Start-Sleep -Seconds 1",
    `Start-Transcript -Path '${escapePowerShell(logPath)}' -Force | Out-Null`,
    `Write-Host 'oh-my-kimicli updater started at' (Get-Date).ToString('s')`,
    `Write-Host 'Target: ${escapePowerShell(plan.target)}'`
  ];
  for (const command of plan.commands) {
    if (command[0] === "bun") {
      lines.push(runPowerShellCommand([bunExe, ...command.slice(1)]));
    } else if (command[0] === "omk") {
      lines.push("$globalBin = & " + quotePowerShell(bunExe) + " pm bin -g");
      lines.push("$omk = Join-Path $globalBin 'omk.exe'");
      lines.push(runPowerShellCommand(["$omk", ...command.slice(1)], { firstIsVariable: true }));
    }
  }
  lines.push("Write-Host 'oh-my-kimicli updater finished at' (Get-Date).ToString('s')");
  lines.push("Stop-Transcript | Out-Null");
  return `${lines.join("\n")}\n`;
}

function runPowerShellCommand(command, { firstIsVariable = false } = {}) {
  const executable = firstIsVariable ? command[0] : quotePowerShell(command[0]);
  const args = command.slice(1).map(quotePowerShell).join(" ");
  return [
    `Write-Host '> ${command.join(" ")}'`,
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

function quotePowerShell(value) {
  return `'${escapePowerShell(value)}'`;
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}
