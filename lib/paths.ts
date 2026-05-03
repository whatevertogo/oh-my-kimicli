import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));

export const packageRoot = findPackageRoot(resolve(here, ".."));

function findPackageRoot(start: string) {
  let current = start;
  for (;;) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "skills")) &&
      existsSync(join(current, "prompts")) &&
      existsSync(join(current, "plugin"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

export function currentEntrypoint() {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
  if (invoked && existsSync(invoked) && /^omk(?:-node)?\.(?:js|ts)$/.test(basename(invoked))) {
    return invoked;
  }
  for (const candidate of [
    join(packageRoot, "dist", "bin", "omk.js"),
    join(packageRoot, "bin", "omk.ts"),
    join(packageRoot, "bin", "omk.js")
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return join(packageRoot, "dist", "bin", "omk.js");
}

export function kimiShareDir(env = process.env) {
  return env.KIMI_SHARE_DIR ? resolve(env.KIMI_SHARE_DIR) : join(homedir(), ".kimi");
}

export function kimiConfigFile(env = process.env) {
  return join(kimiShareDir(env), "config.toml");
}

export function kimiSessionsDir(env = process.env) {
  return join(kimiShareDir(env), "sessions");
}

export function kimiImportedSessionsDir(env = process.env) {
  return join(kimiShareDir(env), "imported_sessions");
}

export function kimiPluginsDir(env = process.env) {
  return join(kimiShareDir(env), "plugins");
}

export function kimiPluginInstallDir(env = process.env) {
  return join(kimiPluginsDir(env), "oh-my-kimicli");
}

export function kimiUserSkillsDir(env = process.env) {
  return env.KIMI_USER_SKILLS_DIR ? resolve(env.KIMI_USER_SKILLS_DIR) : join(homedir(), ".kimi", "skills");
}

export function omkHomeDir(env = process.env) {
  return env.OMK_HOME ? resolve(env.OMK_HOME) : join(homedir(), ".omk");
}

export function omkConfigFile(env = process.env) {
  return join(omkHomeDir(env), "config.json");
}

export function omkUsageDataDir(env = process.env) {
  return join(omkHomeDir(env), "usage-data");
}

export function omkDataDir(env = process.env) {
  return join(kimiShareDir(env), "oh-my-kimicli");
}

export function omkSessionsDir(env = process.env) {
  return join(omkDataDir(env), "sessions");
}

export function projectOmkStateDir(cwd = process.cwd()) {
  return join(resolve(cwd), ".omk", "state");
}

export function projectRalphStateFile(cwd = process.cwd()) {
  return join(projectOmkStateDir(cwd), "ralph-state.json");
}
