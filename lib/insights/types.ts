export const INSIGHTS_SCHEMA_VERSION = 1;

export type LiteSession = {
  sessionId: string;
  workDirHash: string;
  workDir: string;
  sessionDir: string;
  wirePath: string;
  contextPath: string;
  statePath: string;
  imported: boolean;
  mtimeMs: number;
  wireMtimeMs: number;
  wireSize: number;
  contextMtimeMs: number;
  contextSize: number;
};

export type WireEvent = {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source: "root" | "subagent";
};

export type WireTurn = {
  timestamp: number;
  userInput: string;
  events: WireEvent[];
  internal: boolean;
};

export type SessionMeta = {
  schemaVersion: number;
  sessionId: string;
  projectHash: string;
  projectPath: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  firstPrompt: string;
  userMessageCount: number;
  assistantStepCount: number;
  toolCounts: Record<string, number>;
  toolErrorCount: number;
  toolErrorCategories: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  filesModified: string[];
  languages: Record<string, number>;
  linesAdded: number;
  linesRemoved: number;
  gitCommits: number;
  gitPushes: number;
  usesSubagent: boolean;
  usesMcp: boolean;
  usesWeb: boolean;
  userInterruptions: number;
  userResponseTimes: number[];
  messageHours: number[];
  userMessageTimestamps: string[];
  isMetaSession: boolean;
};

export type SessionFacets = {
  underlyingGoal: string;
  goalCategories: Record<string, number>;
  outcome: string;
  userSatisfactionCounts: Record<string, number>;
  assistantHelpfulness: string;
  sessionType: string;
  frictionCounts: Record<string, number>;
  frictionDetail: string;
  primarySuccess: string;
  briefSummary: string;
  userInstructionsToAssistant: string[];
};

export type AggregatedData = {
  generatedAt: string;
  scannedSessions: number;
  analyzedSessions: number;
  facetSessions: number;
  totalUserMessages: number;
  totalAssistantSteps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalToolCalls: number;
  totalToolErrors: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalFilesModified: number;
  totalGitCommits: number;
  totalGitPushes: number;
  daysActive: number;
  messagesPerDay: number;
  averageResponseSeconds: number;
  medianResponseSeconds: number;
  toolCounts: Record<string, number>;
  toolErrorCategories: Record<string, number>;
  languages: Record<string, number>;
  projects: Record<string, { sessions: number; messages: number }>;
  goalCategories: Record<string, number>;
  outcomes: Record<string, number>;
  satisfaction: Record<string, number>;
  helpfulness: Record<string, number>;
  sessionTypes: Record<string, number>;
  friction: Record<string, number>;
  primarySuccess: Record<string, number>;
  frictionDetails: string[];
  sessionSummaries: string[];
  multiSessionUsage: {
    detected: boolean;
    windows: number;
  };
};

export type InsightSections = {
  atAGlance: string;
  projectAreas: string;
  interactionStyle: string;
  whatWorks: string;
  frictionAnalysis: string;
  suggestions: string;
  onTheHorizon: string;
  funEnding: string;
};

export type InsightsOptions = {
  force?: boolean;
  limit?: number;
  facetLimit?: number;
  noLlm?: boolean;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type InsightsReport = {
  generatedAt: string;
  source: "oh-my-kimicli";
  kimiShareDir: string;
  reportHtmlPath: string;
  reportJsonPath: string;
  scannedSessions: number;
  analyzedSessions: number;
  aggregated: AggregatedData;
  sections: InsightSections;
};
