type AnyRecord = Record<string, any>;

export function aggregateData(sessions: AnyRecord[] = [], facets: AnyRecord[] = []): AnyRecord {
  const generatedAt = new Date().toISOString();
  const metas = sessions.filter((meta) => !meta.isMetaSession);
  const responseTimes = metas.flatMap((meta) => meta.userResponseTimes);
  const activeDays = new Set(
    metas
      .flatMap((meta) => meta.userMessageTimestamps)
      .map((timestamp) => String(timestamp).slice(0, 10))
      .filter(Boolean)
  );
  const files = new Set(metas.flatMap((meta) => meta.filesModified));
  const aggregated = {
    generatedAt,
    scannedSessions: sessions.length,
    analyzedSessions: metas.length,
    facetSessions: facets.length,
    totalUserMessages: sum(metas, "userMessageCount"),
    totalAssistantSteps: sum(metas, "assistantStepCount"),
    totalInputTokens: sum(metas, "inputTokens"),
    totalOutputTokens: sum(metas, "outputTokens"),
    totalCacheReadTokens: sum(metas, "cacheReadTokens"),
    totalCacheCreationTokens: sum(metas, "cacheCreationTokens"),
    totalToolCalls: metas.reduce<number>(
      (total, meta) =>
        total +
        Number(Object.values(meta.toolCounts || {}).reduce(
          (subtotal: number, value) => subtotal + Number(value || 0),
          0
        )),
      0
    ),
    totalToolErrors: sum(metas, "toolErrorCount"),
    totalLinesAdded: sum(metas, "linesAdded"),
    totalLinesRemoved: sum(metas, "linesRemoved"),
    totalFilesModified: files.size,
    totalGitCommits: sum(metas, "gitCommits"),
    totalGitPushes: sum(metas, "gitPushes"),
    daysActive: activeDays.size,
    messagesPerDay: activeDays.size ? sum(metas, "userMessageCount") / activeDays.size : 0,
    averageResponseSeconds: average(responseTimes),
    medianResponseSeconds: median(responseTimes),
    toolCounts: mergeCountMaps(metas.map((meta) => meta.toolCounts)),
    toolErrorCategories: mergeCountMaps(metas.map((meta) => meta.toolErrorCategories)),
    languages: mergeCountMaps(metas.map((meta) => meta.languages)),
    projects: aggregateProjects(metas),
    goalCategories: mergeCountMaps(facets.map((facet) => facet.goalCategories)),
    outcomes: countStrings(facets.map((facet) => facet.outcome)),
    satisfaction: mergeCountMaps(facets.map((facet) => facet.userSatisfactionCounts)),
    helpfulness: countStrings(facets.map((facet) => facet.assistantHelpfulness)),
    sessionTypes: countStrings(facets.map((facet) => facet.sessionType)),
    friction: mergeCountMaps(facets.map((facet) => facet.frictionCounts)),
    primarySuccess: countStrings(facets.map((facet) => facet.primarySuccess)),
    frictionDetails: facets.map((facet) => facet.frictionDetail).filter(Boolean).slice(0, 20),
    sessionSummaries: facets.map((facet) => facet.briefSummary).filter(Boolean).slice(0, 50),
    multiSessionUsage: detectMultiSessionUsage(metas)
  };
  return aggregated;
}

function sum(items: AnyRecord[], key: string) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function mergeCountMaps(maps: AnyRecord[]) {
  const out: AnyRecord = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map || {})) {
      out[key] = (out[key] || 0) + Number(value || 0);
    }
  }
  return sortCountMap(out);
}

function countStrings(values: any[]) {
  const out: AnyRecord = {};
  for (const value of values.filter(Boolean)) {
    out[value] = (out[value] || 0) + 1;
  }
  return sortCountMap(out);
}

function aggregateProjects(metas: AnyRecord[]) {
  const out: Record<string, { sessions: number; messages: number }> = {};
  for (const meta of metas) {
    const key = meta.projectPath || meta.projectHash || "unknown";
    out[key] ||= { sessions: 0, messages: 0 };
    out[key].sessions += 1;
    out[key].messages += meta.userMessageCount;
  }
  return Object.fromEntries(
    Object.entries(out).sort((a, b) => b[1].messages - a[1].messages).slice(0, 20)
  );
}

function sortCountMap(map: AnyRecord) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)));
}

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectMultiSessionUsage(metas: AnyRecord[]) {
  const events: Array<{ sessionId: string; time: number }> = [];
  for (const meta of metas) {
    for (const timestamp of meta.userMessageTimestamps) {
      const time = Date.parse(timestamp);
      if (Number.isFinite(time)) {
        events.push({ sessionId: meta.sessionId, time });
      }
    }
  }
  events.sort((a, b) => a.time - b.time);
  let windows = 0;
  for (let i = 0; i < events.length; i += 1) {
    const start = events[i].time;
    const seen = [];
    for (let j = i; j < events.length && events[j].time - start <= 30 * 60 * 1000; j += 1) {
      seen.push(events[j].sessionId);
    }
    for (let j = 2; j < seen.length; j += 1) {
      if (seen[j] === seen[0] && seen[j - 1] !== seen[0]) {
        windows += 1;
        break;
      }
    }
  }
  return { detected: windows > 0, windows };
}
