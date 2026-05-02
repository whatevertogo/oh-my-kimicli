import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { omkUsageDataDir } from "../paths.ts";

export function kimiBinary(env = process.env) {
  return env.OMK_KIMI_BIN || "kimi";
}

export function isKimiAvailable(env = process.env) {
  const result = spawnSync(kimiBinary(env), ["--version"], {
    env,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 3000
  });
  return result.error === undefined && result.status === 0;
}

export function runKimiPrompt(prompt, env = process.env) {
  return new Promise((resolve, reject) => {
    const cwd = omkUsageDataDir(env);
    mkdirSync(cwd, { recursive: true });
    const childEnv = {
      ...env,
      OMK_INSIGHTS_CHILD: "1",
      OMK_INSIGHTS_INTERNAL: "1",
      KIMI_CLI_NO_AUTO_UPDATE: "1",
      NO_COLOR: "1"
    };
    const child = spawn(kimiBinary(env), ["--print", "--final-message-only"], {
      cwd,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("kimi prompt timed out"));
    }, Number(env.OMK_INSIGHTS_LLM_TIMEOUT_MS || 300000));

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`kimi exited with code ${code}: ${stderr.trim()}`));
      }
    });
    child.stdin.end(prompt);
  });
}

export function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model output");
  }
}
