import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kimiShareDir, omkUsageDataDir } from "../paths.ts";
import { aggregateData } from "./aggregate.ts";
import { loadCached, saveCached } from "./cache.ts";
import { getFacetsForSession } from "./facets.ts";
import { generateHtmlReport } from "./html.ts";
import { isKimiAvailable } from "./llm.ts";
import { buildSessionMeta } from "./meta.ts";
import { scanSessions } from "./scan.ts";
import { generateSections } from "./sections.ts";
import { readWireTurns } from "./wire.ts";

export async function generateInsightsReport(options = {}) {
  const env = options.env || process.env;
  const limit = numberOption(options.limit, 200);
  const facetLimit = numberOption(options.facetLimit, 50);
  const usageDir = omkUsageDataDir(env);
  mkdirSync(usageDir, { recursive: true });
  const effectiveOptions = {
    ...options,
    env,
    noLlm: Boolean(options.noLlm || !isKimiAvailable(env))
  };

  const liteSessions = scanSessions(env);
  const metas = [];
  const sessionDetails = [];
  let uncachedParsed = 0;
  for (const session of liteSessions) {
    let meta = options.force ? null : loadCached("session-meta", session, env);
    let turns = null;
    if (!meta) {
      if (uncachedParsed >= limit) {
        continue;
      }
      turns = readWireTurns(session.wirePath);
      meta = buildSessionMeta(session, turns);
      saveCached("session-meta", session, meta, env);
      uncachedParsed += 1;
    }
    if (!turns) {
      turns = readWireTurns(session.wirePath);
    }
    metas.push(meta);
    sessionDetails.push({ session, meta, turns });
  }

  const substantive = sessionDetails.filter(
    ({ meta }) => !meta.isMetaSession && meta.userMessageCount >= 2 && meta.durationMinutes >= 1
  );
  const facets = [];
  for (const detail of substantive.slice(0, facetLimit)) {
    const facet = await getFacetsForSession(detail.session, detail.turns, detail.meta, effectiveOptions);
    if (facet && !isWarmupFacet(facet)) {
      facets.push(facet);
    }
  }

  const aggregated = aggregateData(metas, facets);
  const sections = await generateSections(aggregated, effectiveOptions);
  const report = {
    generatedAt: new Date().toISOString(),
    source: "oh-my-kimicli",
    kimiShareDir: kimiShareDir(env),
    reportHtmlPath: join(usageDir, "report.html"),
    reportJsonPath: join(usageDir, "report.json"),
    scannedSessions: liteSessions.length,
    analyzedSessions: aggregated.analyzedSessions,
    aggregated,
    sections
  };

  writeFileSync(report.reportHtmlPath, generateHtmlReport(report), {
    encoding: "utf8",
    mode: 0o600
  });
  writeFileSync(report.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return report;
}

function numberOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function isWarmupFacet(facet) {
  const keys = Object.keys(facet.goalCategories || {});
  return keys.length === 1 && keys[0] === "warmup_minimal";
}
