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
  omkConfigFile,
  omkDataDir,
  omkUsageDataDir,
  packageRoot
} from "./paths.ts";
import { ensureConfig, readConfig } from "./config.ts";
import { isKimiAvailable, kimiBinary } from "./insights/llm.ts";

const HOOK_BLOCK_START = "# >>> oh-my-kimicli hooks >>>";
const HOOK_BLOCK_END = "# <<< oh-my-kimicli hooks <<<";

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

export function doctor() {
  const config = kimiConfigFile();
  const plugin = kimiPluginInstallDir();
  const skills = kimiUserSkillsDir();
  const omkConfig = readConfig();
  const configText = existsSync(config) ? readFileSync(config, "utf8") : "";
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
    plugin_dir: plugin,
    plugin_installed: existsSync(join(plugin, "plugin.json")),
    skills_dir: skills,
    installed_skills: listInstalledSkills(skills),
    skills: {
      insights_installed: existsSync(join(skills, "insights", "SKILL.md"))
    },
    usage_data_dir: omkUsageDataDir(),
    usage_data_writable: isWritableDir(omkUsageDataDir()),
    kimi_bin: kimiBinary(),
    kimi_available: isKimiAvailable()
  };
}

export function formatDoctorSummary(data = doctor()) {
  return [
    `share_dir: ${data.share_dir}`,
    `data_dir: ${data.data_dir}`,
    `omk_config_file: ${data.omk_config_file} (${data.omk_config_exists ? "exists" : "missing"}, ${data.omk_config_valid ? "valid" : "invalid"})`,
    `features.pet: ${data.omk_config.features.pet ? "enabled" : "disabled"}`,
    `config_file: ${data.config_file} (${data.config_exists ? "exists" : "missing"})`,
    `hooks: ${data.hooks_installed ? "installed" : "missing"}`,
    `plugin: ${data.plugin_installed ? "installed" : "missing"}`,
    `skills: ${data.installed_skills.length ? data.installed_skills.join(", ") : "none"}`,
    `insights skill: ${data.skills.insights_installed ? "installed" : "missing"}`,
    `usage_data_dir: ${data.usage_data_dir} (${data.usage_data_writable ? "writable" : "not writable"})`,
    `kimi binary: ${data.kimi_bin} (${data.kimi_available ? "available" : "unavailable"})`
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
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(sourceRoot, entry.name), dest, { recursive: true });
  }
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
    const sourceSkill = join(sourceRoot, entry.name, "SKILL.md");
    const dest = join(destRoot, entry.name);
    const destSkill = join(dest, "SKILL.md");
    if (!existsSync(sourceSkill) || !existsSync(destSkill)) {
      continue;
    }
    if (readFileSync(sourceSkill, "utf8") === readFileSync(destSkill, "utf8")) {
      rmSync(dest, { recursive: true, force: true });
    }
  }
}

function buildHooksBlock() {
  const command = "omk hook";
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
        `command = "${command}"`,
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
