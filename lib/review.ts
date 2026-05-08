import { execFileSync } from "node:child_process";

export function reviewTarget({ cwd = process.cwd() } = {}) {
  const staged = gitLines(["diff", "--name-only", "--cached"], cwd);
  if (staged.length > 0) {
    return buildTarget("staged", staged, "git diff --cached -- <files>");
  }

  const workingTree = gitLines(["diff", "--name-only"], cwd);
  if (workingTree.length > 0) {
    return buildTarget("working-tree", workingTree, "git diff -- <files>");
  }

  const baseBranch = detectBaseBranch(cwd);
  const branch = baseBranch ? gitLines(["diff", "--name-only", baseBranch], cwd) : [];
  if (branch.length > 0) {
    return buildTarget("branch", branch, `git diff ${baseBranch} -- <files>`, baseBranch);
  }

  return buildTarget("none", [], "git diff");
}

function buildTarget(target, files, diffCommand, baseBranch = "") {
  return {
    target,
    files,
    diff_command: diffCommand,
    base_branch: baseBranch
  };
}

function detectBaseBranch(cwd) {
  for (const branch of ["main", "master"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", branch], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
      return branch;
    } catch {
      // Try the next conventional base branch.
    }
  }
  return "";
}

function gitLines(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
