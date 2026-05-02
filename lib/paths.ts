import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));

export const packageRoot = resolve(here, "..");

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

export function kimiUserSkillsDir() {
  return join(homedir(), ".kimi", "skills");
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
