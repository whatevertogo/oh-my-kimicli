import assert from "node:assert/strict";
import { test } from "bun:test";

import { parseUpdateArgs, runUpdate } from "../lib/update.ts";

test("update defaults to reinstalling the scoped npm package and refreshing setup", () => {
  const lines = [];
  const result = runUpdate(["--dry-run"], { stdout: (line) => lines.push(line) });

  assert.equal(result.scheduled, false);
  assert.deepEqual(result.plan.commands, [
    ["bun", "remove", "-g", "oh-my-kimicli"],
    ["bun", "remove", "-g", "@whatevertogo/oh-my-kimicli"],
    ["bun", "install", "-g", "@whatevertogo/oh-my-kimicli@latest"],
    ["omk", "setup", "--force"]
  ]);
  assert.match(lines.join("\n"), /bun remove -g oh-my-kimicli/);
  assert.match(lines.join("\n"), /omk setup --force/);
});

test("update can use a custom target and skip setup", () => {
  const options = parseUpdateArgs(["--target", "github:owner/repo#dev", "--no-setup", "--in-process"]);

  assert.equal(options.target, "github:owner/repo#dev");
  assert.equal(options.setup, false);
  assert.equal(options.inProcess, true);
});
