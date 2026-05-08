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
	userInstructionsToAssistant: Array<{ instruction: string; count: number }>;
	userLanguage: {
		code: string;
		label: string;
		confidence: number;
		counts: Record<string, number>;
		instruction: string;
	};
	timeOfDay: Record<string, number>;
	workflowSignals: {
		prompt_intents: Record<string, number>;
		feature_mentions: Record<string, number>;
		sessions_with_subagents: number;
		sessions_with_mcp: number;
		sessions_with_web: number;
		sessions_with_tool_errors: number;
		high_iteration_sessions: number;
		git_commit_sessions: number;
		average_files_modified: number;
	};
	uncachedParsedSessions?: number;
	multiSessionUsage: {
		detected: boolean;
		windows: number;
	};
};

export type InsightSections = {
	schema_version: 1;
	at_a_glance: {
		whats_working: string;
		whats_hindering: string;
		quick_wins: string;
		ambitious_workflows: string;
	};
	project_areas: {
		areas: Array<{ name: string; session_count: number; description: string }>;
	};
	interaction_style: {
		narrative: string;
		key_pattern: string;
	};
	what_works: {
		intro: string;
		impressive_workflows: Array<{ title: string; description: string }>;
	};
	friction_analysis: {
		intro: string;
		categories: Array<{
			category: string;
			description: string;
			examples: string[];
		}>;
	};
	suggestions: {
		kimi_instructions_additions: Array<{
			addition: string;
			why: string;
			prompt_scaffold: string;
		}>;
		features_to_try: Array<{
			feature: string;
			one_liner: string;
			why_for_you: string;
			example_code: string;
		}>;
		usage_patterns: Array<{
			title: string;
			suggestion: string;
			detail: string;
			copyable_prompt: string;
		}>;
	};
	skill_opportunities: Array<{
		name: string;
		trigger: string;
		why: string;
		evidence: string[];
		proposed_scope: string;
		risk: string;
		example_prompt: string;
		recommended_action:
			| "create_skill"
			| "update_skill"
			| "add_hook"
			| "add_agents_instruction"
			| "no_action";
	}>;
	on_the_horizon: {
		intro: string;
		opportunities: Array<{
			title: string;
			whats_possible: string;
			how_to_try: string;
			copyable_prompt: string;
		}>;
	};
	fun_ending: {
		headline: string;
		detail: string;
	};
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
