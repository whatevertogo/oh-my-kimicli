import {
  createHash
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  kimiConfigFile,
  kimiPluginInstallDir,
  kimiUserSkillsDir,
  currentEntrypoint,
  omkConfigFile,
  omkDataDir,
  omkUsageDataDir,
  packageRoot
} from "./paths.ts";
import { ensureConfig, readConfig } from "./config.ts";
import pluginManifest from "../plugin/plugin.json" with { type: "json" };

const HOOK_BLOCK_START = "# >>> oh-my-kimicli hooks >>>";
const HOOK_BLOCK_END = "# <<< oh-my-kimicli hooks <<<";
const SKILL_MARKER_FILE = ".omk-managed.json";
type SkillStatus = {
  exists: boolean;
  managed: boolean;
  current: boolean;
  modified: boolean;
  reason: string;
};

export function setup({ force = false } = {}) {
  ensureConfig();
  installPlugin();
  installSkills(force);
  mergeHooksBlock();
  mkdirSync(join(omkDataDir(), "sessions"), { recursive: true });
  mkdirSync(omkUsageDataDir(), { recursive: true });
}

export function uninstall() {
  removeHooksBlock();
  rmSync(kimiPluginInstallDir(), { recursive: true, force: true });
  removeManagedSkills();
}

export function doctor({ runtime = false } = {}) {
  const config = kimiConfigFile();
  const plugin = kimiPluginInstallDir();
  const skills = kimiUserSkillsDir();
  const omkConfig = readConfig();
  const configText = existsSync(config) ? readFileSync(config, "utf8") : "";
  const hookCommand = extractManagedHookCommand(configText);
  const installedInsightsSkill = join(skills, "insights", "SKILL.md");
  const insightsSkillText = existsSync(installedInsightsSkill)
    ? readFileSync(installedInsightsSkill, "utf8")
    : "";
  const insightsSkillCurrent = isCurrentInsightsSkill(insightsSkillText);
  const skillStatus = inspectSkills(skills);
  return {
    share_dir: omkDataDir().replace(/[\\/]oh-my-kimicli$/, ""),
    data_dir: omkDataDir(),
    omk_config_file: omkConfigFile(),
    omk_config_exists: omkConfig.exists,
    omk_config_valid: omkConfig.valid,
    omk_config: omkConfig.config,
    config_file: config,
    config_exists: existsSync(config),
    hooks_installed: configText.includes(HOOK_BLOCK_START),
    hook_command: hookCommand,
    hook_command_resolvable: hookCommand ? commandLooksResolvable(hookCommand) : false,
    runtime_check: runtime ? checkRuntimeHook() : null,
    plugin_dir: plugin,
    plugin_installed: existsSync(join(plugin, "plugin.json")),
    plugin_manifest: pluginManifest,
    plugin_capabilities: pluginManifest.kimi || {},
    skills_dir: skills,
    installed_skills: Object.entries(skillStatus)
      .filter(([, status]) => status.managed)
      .map(([name]) => name),
    skill_status: skillStatus,
    skills: {
      insights_installed: existsSync(installedInsightsSkill),
      insights_current: insightsSkillCurrent,
      insights_stale: existsSync(installedInsightsSkill) && !insightsSkillCurrent
    },
    usage_data_dir: omkUsageDataDir(),
    usage_data_writable: isWritableDir(omkUsageDataDir())
  };
}

export function formatDoctorSummary(data = doctor()) {
  return [
    `share_dir: ${data.share_dir}`,
    `data_dir: ${data.data_dir}`,
    `omk_config_file: ${data.omk_config_file} (${data.omk_config_exists ? "exists" : "missing"}, ${data.omk_config_valid ? "valid" : "invalid"})`,
    `features.pet: ${data.omk_config.features.pet ? "enabled" : "disabled"}`,
    `config_file: ${data.config_file} (${data.config_exists ? "exists" : "missing"})`,
    `hooks: ${data.hooks_installed ? "installed" : "missing"}${data.hook_command ? ` (${data.hook_command_resolvable ? "resolvable" : "not resolvable"})` : ""}`,
    `plugin: ${data.plugin_installed ? "installed" : "missing"}`,
    `skills: ${formatSkillSummary(data.skill_status)}`,
    `insights skill: ${data.skills.insights_installed ? (data.skills.insights_current ? "current" : "stale") : "missing"}`,
    `usage_data_dir: ${data.usage_data_dir} (${data.usage_data_writable ? "writable" : "not writable"})`
  ].join("\n");
}

function installPlugin() {
  const source = join(packageRoot, "plugin");
  const dest = kimiPluginInstallDir();
  const parent = join(dest, "..");
  const temp = join(parent, `.oh-my-kimicli-${process.pid}-${Date.now()}.tmp`);
  mkdirSync(parent, { recursive: true });
  rmSync(temp, { recursive: true, force: true });
  try {
    cpSync(source, temp, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    renameSync(temp, dest);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function installSkills(force) {
  const sourceRoot = join(packageRoot, "skills");
  const destRoot = kimiUserSkillsDir();
  mkdirSync(destRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dest = join(destRoot, entry.name);
    if (existsSync(dest) && !force) {
      continue;
    }
    if (existsSync(dest) && force) {
      if (!canReplaceManagedSkill(dest, entry.name)) {
        continue;
      }
      backupSkill(destRoot, entry.name);
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(sourceRoot, entry.name), dest, { recursive: true });
    writeSkillMarker(dest, entry.name);
  }
}

function canReplaceManagedSkill(skillDir, skillName) {
  return isManagedSkill(skillDir, skillName) && skillIsUnmodified(skillDir);
}

function isManagedSkill(skillDir, skillName) {
  const markerPath = join(skillDir, SKILL_MARKER_FILE);
  if (!existsSync(markerPath)) {
    return false;
  }
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    return marker.manager === "oh-my-kimicli" && marker.skill === skillName;
  } catch {
    return false;
  }
}

function skillIsUnmodified(skillDir) {
  try {
    const marker = JSON.parse(readFileSync(join(skillDir, SKILL_MARKER_FILE), "utf8"));
    return marker.content_hash === skillContentHash(skillDir);
  } catch {
    return false;
  }
}

function writeSkillMarker(skillDir, skillName) {
  const marker = {
    manager: "oh-my-kimicli",
    skill: skillName,
    content_hash: skillContentHash(skillDir),
    updated_at: new Date().toISOString()
  };
  writeFileSync(join(skillDir, SKILL_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

function skillContentHash(skillDir) {
  const hash = createHash("sha256");
  for (const file of listSkillFiles(skillDir)) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(skillDir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listSkillFiles(root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.name === SKILL_MARKER_FILE) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...listSkillFiles(root, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

function backupSkill(destRoot, skillName) {
  const source = join(destRoot, skillName);
  const backupRoot = join(destRoot, ".omk-backups", timestampForPath());
  mkdirSync(backupRoot, { recursive: true });
  cpSync(source, join(backupRoot, skillName), { recursive: true });
}

function mergeHooksBlock() {
  const config = kimiConfigFile();
  mkdirSync(dirname(config), { recursive: true });
  const current = existsSync(config) ? readFileSync(config, "utf8") : "";
  const block = buildHooksBlock();
  const next = replaceManagedBlock(current, block);
  if (current !== next) {
    if (existsSync(config)) {
      copyFileSync(config, `${config}.omk.bak`);
    }
    writeFileSync(config, next, "utf8");
  }
}

function removeHooksBlock() {
  const config = kimiConfigFile();
  if (!existsSync(config)) {
    return;
  }
  const current = readFileSync(config, "utf8");
  const next = replaceManagedBlock(current, "");
  if (current !== next) {
    copyFileSync(config, `${config}.omk.bak`);
    writeFileSync(config, next, "utf8");
  }
}

function removeManagedSkills() {
  const sourceRoot = join(packageRoot, "skills");
  const destRoot = kimiUserSkillsDir();
  if (!existsSync(destRoot)) {
    return;
  }
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dest = join(destRoot, entry.name);
    if (!existsSync(dest) || !isManagedSkill(dest, entry.name)) {
      continue;
    }
    if (!skillIsUnmodified(dest)) {
      backupSkill(destRoot, entry.name);
    }
    rmSync(dest, { recursive: true, force: true });
  }
}

function buildHooksBlock() {
  const command = `${shellQuote(process.execPath)} ${shellQuote(currentEntrypoint())} hook`;
  const events = [
    "UserPromptSubmit",
    "Stop",
    "PreToolUse",
    "PostToolUse",
    "SubagentStop",
    "StopFailure"
  ];
  const body = events
    .map(
      (event) => [
        "[[hooks]]",
        `event = "${event}"`,
        'matcher = ""',
        `command = ${JSON.stringify(command)}`,
        "timeout = 30"
      ].join("\n")
    )
    .join("\n\n");
  return `${HOOK_BLOCK_START}\n${body}\n${HOOK_BLOCK_END}`;
}

function replaceManagedBlock(text, block) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const normalizedBlock = block.replace(/\n/g, newline);
  const pattern = new RegExp(`${escapeRegex(HOOK_BLOCK_START)}[\\s\\S]*?${escapeRegex(HOOK_BLOCK_END)}\\r?\\n?`, "m");
  const clean = text.replace(pattern, "").trimEnd();
  if (!block) {
    return clean ? `${clean}${newline}` : "";
  }
  return clean
    ? `${clean}${newline}${newline}${normalizedBlock}${newline}`
    : `${normalizedBlock}${newline}`;
}

function listInstalledSkills(skillsDir) {
  if (!existsSync(skillsDir)) {
    return [];
  }
  const sourceRoot = join(packageRoot, "skills");
  const managedSkillNames = new Set(
    readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && managedSkillNames.has(entry.name))
    .map((entry) => basename(entry.name))
    .sort();
}

function inspectSkills(skillsDir: string): Record<string, SkillStatus> {
  const sourceRoot = join(packageRoot, "skills");
  const result: Record<string, SkillStatus> = {};
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const source = join(sourceRoot, entry.name);
    const dest = join(skillsDir, entry.name);
    const exists = existsSync(dest);
    const managed = exists && isManagedSkill(dest, entry.name);
    const modified = managed && !skillIsUnmodified(dest);
    const current = managed && skillContentHash(dest) === skillContentHash(source);
    result[entry.name] = {
      exists,
      managed,
      current,
      modified,
      reason: skillStatusReason({ exists, managed, current, modified })
    };
  }
  return result;
}

function skillStatusReason({ exists, managed, current, modified }: Omit<SkillStatus, "reason">) {
  if (!exists) {
    return "missing";
  }
  if (!managed) {
    return "same-name user skill without OMK marker";
  }
  if (modified) {
    return "OMK-managed skill edited locally";
  }
  if (!current) {
    return "OMK-managed skill differs from package source";
  }
  return "current";
}

function formatSkillSummary(status: Record<string, SkillStatus>) {
  const entries = Object.entries(status || {});
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([name, item]) => `${name}:${item.reason}`).join(", ");
}

function extractManagedHookCommand(configText) {
  const start = configText.indexOf(HOOK_BLOCK_START);
  const end = configText.indexOf(HOOK_BLOCK_END);
  if (start < 0 || end < start) {
    return "";
  }
  const block = configText.slice(start, end);
  const match = /^\s*command\s*=\s*"((?:\\"|[^"])*)"/m.exec(block);
  return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
}

function commandLooksResolvable(command) {
  const match = /^"([^"]+)"|^(\S+)/.exec(command);
  const executable = match ? match[1] || match[2] : "";
  return executable ? existsSync(executable) || executable === "omk" : false;
}

function checkRuntimeHook() {
  const result = spawnSync(process.execPath, [currentEntrypoint(), "hook"], {
    input: JSON.stringify({
      session_id: "omk-doctor-runtime",
      hook_event_name: "PreToolUse",
      tool_name: "ReadFile",
      tool_input: { path: "README.md" },
      cwd: packageRoot
    }),
    encoding: "utf8",
    env: process.env
  });
  return {
    ok: result.status === 0,
    exit_code: result.status,
    stderr: String(result.stderr || "").trim(),
    stdout: String(result.stdout || "").trim()
  };
}

function shellQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isWritableDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isCurrentInsightsSkill(text) {
  return (
    text.includes("omk insights prepare") &&
    text.includes("evidence-pack.md") &&
    text.includes("omk insights render") &&
    !text.includes("omk insights collect") &&
    !text.includes("insights-prompt.md") &&
    !text.includes("--no-llm")
  );
}
