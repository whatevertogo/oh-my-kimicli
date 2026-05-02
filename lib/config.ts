import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { omkConfigFile } from "./paths.ts";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
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
  const config = current.valid ? current.config : cloneDefaultConfig();
  writeFileSync(current.path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    path: current.path,
    exists: true,
    valid: true,
    config
  };
}

function normalizeConfig(value) {
  const source = isRecord(value) ? value : {};
  const features = isRecord(source.features) ? source.features : {};
  return {
    version: Number.isInteger(source.version) ? source.version : DEFAULT_CONFIG.version,
    features: {
      pet: typeof features.pet === "boolean" ? features.pet : DEFAULT_CONFIG.features.pet
    }
  };
}

function cloneDefaultConfig() {
  return {
    version: DEFAULT_CONFIG.version,
    features: {
      pet: DEFAULT_CONFIG.features.pet
    }
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
