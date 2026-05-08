const SECRET_RULES = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: "<redacted-secret>" },
  { pattern: /\bghp_[A-Za-z0-9_]{16,}\b/g, replacement: "<redacted-secret>" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replacement: "<redacted-secret>" },
  { pattern: /\bxoxb-[A-Za-z0-9-]{16,}\b/g, replacement: "<redacted-secret>" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "<redacted-secret>" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, replacement: "Bearer <redacted-secret>" },
  {
    pattern: /\b(OPENAI_API_KEY|MOONSHOT_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN)\s*=\s*[^\s"'`]+/gi,
    replacement: "$1=<redacted-secret>"
  },
  {
    pattern:
      /(["']?(?:OPENAI_API_KEY|MOONSHOT_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN)["']?\s*:\s*["'])([^"']+)(["'])/gi,
    replacement: "$1<redacted-secret>$3"
  }
];

const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g;
const POSIX_PATH_PATTERN = /(?:^|[\s"'`])\/(?:Users|home|root|var|tmp|mnt)\/[^\s"'`]+/g;

export function redactText(value, options: Record<string, unknown> = {}) {
  let text = String(value ?? "");
  if (options.redact_secrets !== false) {
    for (const rule of SECRET_RULES) {
      text = text.replace(rule.pattern, rule.replacement);
    }
  }
  if (options.redact_paths) {
    text = text
      .replace(WINDOWS_PATH_PATTERN, "<redacted-path>")
      .replace(POSIX_PATH_PATTERN, (match) => `${match[0] === " " ? " " : ""}<redacted-path>`);
  }
  return text;
}

export function redactJson(value, options: Record<string, unknown> = {}) {
  if (typeof value === "string") {
    return redactText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item, options));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactJson(item, options)])
  );
}
