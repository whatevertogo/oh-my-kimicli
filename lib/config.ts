import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { omkConfigFile } from "./paths.ts";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  privacy: Object.freeze({
    record_hook_prompts: false,
    record_cwd: true,
    redact_secrets: true,
    redact_paths: false
  }),
  safety: Object.freeze({
    block_destructive_shell: true,
    warn_cleanup_dirs: true
  }),
  features: Object.freeze({
    pet: false
  })
});

export function readConfig(env = process.env) {
  const path = omkConfigFile(env);
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      valid: true,
      config: cloneDefaultConfig()
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      path,
      exists: true,
      valid: true,
      config: normalizeConfig(parsed)
    };
  } catch (error) {
    return {
      path,
      exists: true,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      config: cloneDefaultConfig()
    };
  }
}

export function ensureConfig(env = process.env) {
  const current = readConfig(env);
  mkdirSync(dirname(current.path), { recursive: true });
  let backupPath = "";
  if (current.exists && !current.valid) {
    backupPath = `${current.path}.invalid-${timestampForPath()}`;
    copyFileSync(current.path, backupPath);
  }
  const config = current.valid ? current.config : cloneDefaultConfig();
  writeFileSync(current.path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    path: current.path,
    exists: true,
    valid: true,
    backup_path: backupPath,
    config
  };
}

function normalizeConfig(value) {
  const source = isRecord(value) ? value : {};
  const features = isRecord(source.features) ? source.features : {};
  const privacy = isRecord(source.privacy) ? source.privacy : {};
  const safety = isRecord(source.safety) ? source.safety : {};
  return {
    version: Number.isInteger(source.version) ? source.version : DEFAULT_CONFIG.version,
    privacy: {
      record_hook_prompts:
        typeof privacy.record_hook_prompts === "boolean"
          ? privacy.record_hook_prompts
          : DEFAULT_CONFIG.privacy.record_hook_prompts,
      record_cwd:
        typeof privacy.record_cwd === "boolean"
          ? privacy.record_cwd
          : DEFAULT_CONFIG.privacy.record_cwd,
      redact_secrets:
        typeof privacy.redact_secrets === "boolean"
          ? privacy.redact_secrets
          : DEFAULT_CONFIG.privacy.redact_secrets,
      redact_paths:
        typeof privacy.redact_paths === "boolean"
          ? privacy.redact_paths
          : DEFAULT_CONFIG.privacy.redact_paths
    },
    safety: {
      block_destructive_shell:
        typeof safety.block_destructive_shell === "boolean"
          ? safety.block_destructive_shell
          : DEFAULT_CONFIG.safety.block_destructive_shell,
      warn_cleanup_dirs:
        typeof safety.warn_cleanup_dirs === "boolean"
          ? safety.warn_cleanup_dirs
          : DEFAULT_CONFIG.safety.warn_cleanup_dirs
    },
    features: {
      pet: typeof features.pet === "boolean" ? features.pet : DEFAULT_CONFIG.features.pet
    }
  };
}

function cloneDefaultConfig() {
  return structuredClone(DEFAULT_CONFIG);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
