import assert from "node:assert/strict";
import { test } from "bun:test";

import { parseUpdateArgs, quotePowerShell, runUpdate, windowsUpdateScript } from "../lib/update.ts";

test("update defaults to reinstalling the scoped npm package and refreshing setup", () => {
  const lines = [];
  const result = runUpdate(["--dry-run"], { stdout: (line) => lines.push(line) });

  assert.equal(result.scheduled, false);
  assert.deepEqual(result.plan.commands, [
    ["npm", "uninstall", "-g", "oh-my-kimicli"],
    ["npm", "uninstall", "-g", "@whatevertogo/oh-my-kimicli"],
    ["npm", "install", "-g", "@whatevertogo/oh-my-kimicli@latest"],
    ["omk", "setup", "--force"]
  ]);
  assert.match(lines.join("\n"), /npm uninstall -g oh-my-kimicli/);
  assert.match(lines.join("\n"), /omk setup --force/);
});

test("update can use a custom target and skip setup", () => {
  const options = parseUpdateArgs(["--target", "github:owner/repo#dev", "--no-setup", "--in-process"]);

  assert.equal(options.target, "github:owner/repo#dev");
  assert.equal(options.setup, false);
  assert.equal(options.inProcess, true);
});

test("update can still opt into Bun for developer installs", () => {
  const result = runUpdate(["--dry-run", "--manager", "bun"], { stdout: () => {} });

  assert.equal(result.plan.packageManager, "bun");
  assert.deepEqual(result.plan.commands.slice(0, 3), [
    ["bun", "remove", "-g", "oh-my-kimicli"],
    ["bun", "remove", "-g", "@whatevertogo/oh-my-kimicli"],
    ["bun", "install", "-g", "@whatevertogo/oh-my-kimicli@latest"]
  ]);
});

test("windows update script keeps dynamic values inside PowerShell literals", () => {
  const target = "pkg'; Remove-Item C:\\ -Recurse #";
  const script = windowsUpdateScript({
    logPath: "C:\\Users\\me\\update.log",
    plan: {
      packageManager: "npm",
      target,
      commands: [
        ["npm", "install", "-g", target],
        ["omk", "setup", "--force"]
      ]
    }
  });

  assert.equal(quotePowerShell("a'b$c`d"), "'a''b$c`d'");
  assert.match(script, /Target: pkg''; Remove-Item C:\\ -Recurse #/);
  assert.match(script, /Write-Host '> npm install -g pkg''; Remove-Item C:\\ -Recurse #'/);
  assert.match(script, /& 'npm'/);
  assert.match(script, /\$globalBin = & 'npm' prefix -g/);
  assert.match(script, /\$omk = Join-Path \$globalBin 'omk\.cmd'/);
  assert.match(script, /& \$omk 'setup' '--force'/);
});
