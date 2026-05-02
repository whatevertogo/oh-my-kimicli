export function generateHtmlReport(report) {
  const data = report.aggregated || {};
  const sections = report.sections || {};
  const labels = htmlLabels(data);
  return `<!doctype html>
<html lang="${escapeHtml(htmlLang(data))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #fbfbfa;
      --panel: #ffffff;
      --panel-soft: #f7f7f5;
      --text: #111114;
      --muted: #71717a;
      --line: #e6e4df;
      --line-strong: #d8d5ce;
      --accent: #5c6cff;
      --accent-soft: #eef1ff;
      --mint: #e8f7f1;
      --shadow: 0 18px 45px rgba(17, 17, 20, 0.06);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    main { max-width: 1120px; margin: 0 auto; padding: 30px 18px 58px; }
    h1 { margin: 0; font-size: clamp(24px, 4vw, 44px); font-weight: 720; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 18px; font-weight: 680; letter-spacing: 0; }
    h3 { margin: 14px 0 6px; font-size: 15px; font-weight: 650; letter-spacing: 0; }
    p { line-height: 1.68; margin: 7px 0; }
    code { background: var(--panel-soft); border: 1px solid var(--line); border-radius: 5px; padding: 2px 5px; }
    .muted { color: var(--muted); }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin: 0 0 16px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .stat {
      flex: 1 1 135px;
      padding: 13px 16px;
      min-height: 76px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid transparent;
    }
    .stat:last-child { border-right: none; }
    .stat strong { display: block; font-size: 22px; margin-top: 7px; font-weight: 720; }
    .toc {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 18px;
    }
    .toc a {
      color: var(--text);
      text-decoration: none;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.72);
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 13px;
    }
    .toc a:hover { border-color: var(--line-strong); background: var(--panel); }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin-top: 14px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 14px; }
    .glance-grid { display: flex; flex-direction: column; gap: 10px; }
    .glance-card { border-left: 3px solid var(--accent); padding: 3px 0 3px 13px; }
    .glance-card strong { display: block; margin-bottom: 6px; }
    .bar { display: grid; grid-template-columns: minmax(96px, 190px) 1fr 44px; gap: 10px; align-items: center; margin: 9px 0; font-size: 13px; }
    .track { height: 10px; background: #eeeeeb; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, #111114, var(--accent)); }
    .list { padding-left: 20px; margin: 8px 0 0; }
    .item { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .copy { white-space: pre-wrap; word-break: break-word; background: #f4f5ff; border: 1px solid #dfe3ff; border-radius: 8px; padding: 11px; margin-top: 8px; color: #20233a; }
    @media (max-width: 720px) {
      main { padding: 18px 12px 44px; }
      .bar { grid-template-columns: 1fr; gap: 5px; }
    }
  </style>
</head>
<body>
<main>
  <div class="stats">
    ${stat(labels.sessions, data.scannedSessions)}
    ${stat(labels.analyzed, data.analyzedSessions)}
    ${stat(labels.messages, data.totalUserMessages)}
    ${stat(labels.toolCalls, data.totalToolCalls)}
    ${stat(labels.files, data.totalFilesModified)}
    ${stat(labels.activeDays, data.daysActive)}
    ${stat(labels.language, displayLanguage(data.userLanguage, labels))}
  </div>
  ${toc(labels)}
  ${atAGlance(sections.at_a_glance, labels)}
  <div class="grid">
    ${chartSection(labels.goals, data.goalCategories, labels)}
    ${chartSection(labels.tools, data.toolCounts, labels)}
    ${chartSection(labels.languages, data.languages, labels)}
    ${chartSection(labels.sessionTypes, data.sessionTypes, labels)}
  </div>
  ${projectAreas(sections.project_areas, labels)}
  ${interactionStyle(sections.interaction_style, labels)}
  <div class="grid">
    ${responseTime(data, labels)}
    ${chartSection(labels.toolErrors, data.toolErrorCategories, labels)}
    ${chartSection(labels.timeOfDay, data.timeOfDay, labels)}
    ${chartSection(labels.promptIntents, data.workflowSignals?.prompt_intents, labels)}
  </div>
  ${workflowSignals(data.workflowSignals, labels)}
  ${whatWorks(sections.what_works, labels)}
  ${frictionAnalysis(sections.friction_analysis, labels)}
  ${skillOpportunities(sections.skill_opportunities, labels)}
  ${suggestions(sections.suggestions, labels)}
  ${horizon(sections.on_the_horizon, labels)}
  ${funEnding(sections.fun_ending, labels)}
</main>
</body>
</html>
`;
}

function stat(label, value) {
  return `<div class="stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong></div>`;
}

function toc(labels) {
  return `<nav class="toc" aria-label="${escapeHtml(labels.sections)}">
    <a href="#section-glance">${escapeHtml(labels.atAGlance)}</a>
    <a href="#section-work">${escapeHtml(labels.projectAreas)}</a>
    <a href="#section-usage">${escapeHtml(labels.interactionStyle)}</a>
    <a href="#section-wins">${escapeHtml(labels.whatWorks)}</a>
    <a href="#section-friction">${escapeHtml(labels.friction)}</a>
    <a href="#section-suggestions">${escapeHtml(labels.suggestions)}</a>
    <a href="#section-skills">${escapeHtml(labels.skillOpportunities)}</a>
    <a href="#section-horizon">${escapeHtml(labels.horizon)}</a>
  </nav>`;
}

function atAGlance(section = {}, labels) {
  return `<section id="section-glance"><h2>${escapeHtml(labels.atAGlance)}</h2>
    <div class="glance-grid">
      ${glanceCard(labels.whatsWorking, section.whats_working, labels)}
      ${glanceCard(labels.whatsHindering, section.whats_hindering, labels)}
      ${glanceCard(labels.quickWins, section.quick_wins, labels)}
      ${glanceCard(labels.ambitiousWorkflows, section.ambitious_workflows, labels)}
    </div>
  </section>`;
}

function glanceCard(label, body, labels) {
  return `<div class="glance-card"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(body || labels.weakEvidence)}</p></div>`;
}

function projectAreas(section = {}, labels) {
  const areas = Array.isArray(section.areas) ? section.areas : [];
  const body = areas.length
    ? areas
        .map(
          (area) =>
            `<div class="item"><h3>${escapeHtml(area.name)} <span class="muted">(${escapeHtml(formatNumber(area.session_count))} sessions)</span></h3><p>${escapeHtml(area.description)}</p></div>`
        )
        .join("")
    : `<p class="muted">${escapeHtml(labels.weakEvidence)}</p>`;
  return `<section id="section-work"><h2>${escapeHtml(labels.projectAreas)}</h2>${body}</section>`;
}

function interactionStyle(section = {}, labels) {
  return `<section id="section-usage"><h2>${escapeHtml(labels.interactionStyle)}</h2>
    <p>${escapeHtml(section.narrative || labels.weakEvidence)}</p>
    <p><strong>${escapeHtml(labels.keyPattern)}:</strong> ${escapeHtml(section.key_pattern || labels.weakEvidence)}</p>
  </section>`;
}

function whatWorks(section = {}, labels) {
  const workflows = Array.isArray(section.impressive_workflows) ? section.impressive_workflows : [];
  return `<section id="section-wins"><h2>${escapeHtml(labels.whatWorks)}</h2>
    <p>${escapeHtml(section.intro || labels.weakEvidence)}</p>
    ${itemList(workflows, (item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>`, labels)}
  </section>`;
}

function frictionAnalysis(section = {}, labels) {
  const categories = Array.isArray(section.categories) ? section.categories : [];
  return `<section id="section-friction"><h2>${escapeHtml(labels.friction)}</h2>
    <p>${escapeHtml(section.intro || labels.weakEvidence)}</p>
    ${itemList(
      categories,
      (item) =>
        `<h3>${escapeHtml(item.category)}</h3><p>${escapeHtml(item.description)}</p>${bulletList(item.examples)}`
      ,
      labels
    )}
  </section>`;
}

function suggestions(section = {}, labels) {
  return `<section id="section-suggestions"><h2>${escapeHtml(labels.suggestions)}</h2>
    <h3>${escapeHtml(labels.kimiInstructions)}</h3>
    ${itemList(section.kimi_instructions_additions, (item) => `<p><strong>${escapeHtml(item.addition)}</strong></p><p>${escapeHtml(item.why)}</p>${copyBlock(item.prompt_scaffold)}`, labels)}
    <h3>${escapeHtml(labels.featuresToTry)}</h3>
    ${itemList(section.features_to_try, (item) => `<p><strong>${escapeHtml(item.feature)}</strong> - ${escapeHtml(item.one_liner)}</p><p>${escapeHtml(item.why_for_you)}</p>${copyBlock(item.example_code)}`, labels)}
    <h3>${escapeHtml(labels.usagePatterns)}</h3>
    ${itemList(section.usage_patterns, (item) => `<p><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(item.suggestion)}</p><p>${escapeHtml(item.detail)}</p>${copyBlock(item.copyable_prompt)}`, labels)}
  </section>`;
}

function skillOpportunities(items = [], labels) {
  const opportunities = Array.isArray(items) ? items : [];
  return `<section id="section-skills"><h2>${escapeHtml(labels.skillOpportunities)}</h2>
    <p class="muted">${escapeHtml(labels.skillOpportunityNote)}</p>
    ${itemList(
      opportunities,
      (item) =>
        `<h3>${escapeHtml(item.name)} <span class="muted">(${escapeHtml(item.recommended_action || "no_action")})</span></h3>
        <p><strong>${escapeHtml(labels.trigger)}:</strong> ${escapeHtml(item.trigger)}</p>
        <p><strong>${escapeHtml(labels.why)}:</strong> ${escapeHtml(item.why)}</p>
        ${bulletList(item.evidence)}
        <p><strong>${escapeHtml(labels.scope)}:</strong> ${escapeHtml(item.proposed_scope)}</p>
        <p><strong>${escapeHtml(labels.risk)}:</strong> ${escapeHtml(item.risk)}</p>
        ${copyBlock(item.example_prompt)}`,
      labels
    )}
  </section>`;
}

function horizon(section = {}, labels) {
  return `<section id="section-horizon"><h2>${escapeHtml(labels.horizon)}</h2>
    <p>${escapeHtml(section.intro || labels.weakEvidence)}</p>
    ${itemList(section.opportunities, (item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.whats_possible)}</p><p>${escapeHtml(item.how_to_try)}</p>${copyBlock(item.copyable_prompt)}`, labels)}
  </section>`;
}

function funEnding(section = {}, labels) {
  return `<section id="section-ending"><h2>${escapeHtml(labels.funEnding)}</h2><h3>${escapeHtml(section.headline || labels.weakEvidence)}</h3><p>${escapeHtml(section.detail || "")}</p></section>`;
}

function responseTime(data, labels) {
  return `<section><h2>${escapeHtml(labels.responseTime)}</h2>
    <p><strong>${escapeHtml(labels.average)}:</strong> ${escapeHtml(formatSeconds(data.averageResponseSeconds, labels))}</p>
    <p><strong>${escapeHtml(labels.median)}:</strong> ${escapeHtml(formatSeconds(data.medianResponseSeconds, labels))}</p>
    <p><strong>${escapeHtml(labels.multiSession)}:</strong> ${data.multiSessionUsage?.detected ? `${escapeHtml(labels.detectedIn)} ${escapeHtml(formatNumber(data.multiSessionUsage.windows))}` : labels.notDetected}</p>
  </section>`;
}

function workflowSignals(signals = {}, labels) {
  const rows = [
    [labels.subagentSessions, signals.sessions_with_subagents],
    [labels.mcpSessions, signals.sessions_with_mcp],
    [labels.webSessions, signals.sessions_with_web],
    [labels.toolErrorSessions, signals.sessions_with_tool_errors],
    [labels.highIterationSessions, signals.high_iteration_sessions],
    [labels.gitCommitSessions, signals.git_commit_sessions],
    [labels.averageFilesModified, signals.average_files_modified]
  ];
  return `<section><h2>${escapeHtml(labels.workflowSignals)}</h2>
    ${rows
      .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatNumber(value || 0))}</p>`)
      .join("")}
  </section>`;
}

function paragraph(label, body, labels) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(body || labels.weakEvidence)}</p>`;
}

function chartSection(title, map, labels) {
  const entries = Object.entries(map || {}).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  const bars = entries.length
    ? entries
        .map(([key, value]) => {
          const count = Number(value) || 0;
          return `<div class="bar"><span>${escapeHtml(labelize(key))}</span><div class="track"><div class="fill" style="width:${Math.round((count / max) * 100)}%"></div></div><span>${escapeHtml(formatNumber(count))}</span></div>`;
        })
        .join("")
    : `<div class="muted">${escapeHtml(labels.noData)}</div>`;
  return `<section><h2>${escapeHtml(title)}</h2>${bars}</section>`;
}

function itemList(items, render, labels) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length
    ? list.map((item) => `<div class="item">${render(item)}</div>`).join("")
    : `<p class="muted">${escapeHtml(labels.noEntries)}</p>`;
}

function bulletList(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length ? `<ul class="list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
}

function copyBlock(value) {
  return value ? `<div class="copy">${escapeHtml(value)}</div>` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : String(value ?? "");
}

function formatSeconds(value, labels = { notAvailable: "n/a" }) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number)}s` : labels.notAvailable;
}

function labelize(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function htmlLang(data) {
  return data.userLanguage?.code === "zh" ? "zh-CN" : "en";
}

function displayLanguage(profile = {}, labels) {
  if (profile.code === "zh") {
    return labels.languageZh;
  }
  if (profile.code === "mixed") {
    return labels.languageMixed;
  }
  if (profile.code === "en") {
    return labels.languageEn;
  }
  return profile.label || labels.unknown;
}

function htmlLabels(data) {
  if (data.userLanguage?.code !== "zh") {
    return {
      title: "oh-my-kimicli insights",
      sessions: "Sessions",
      analyzed: "Analyzed",
      messages: "Messages",
      toolCalls: "Tool calls",
      files: "Files",
      activeDays: "Active days",
      language: "Language",
      languageEn: "English",
      languageZh: "Chinese",
      languageMixed: "Mixed",
      unknown: "unknown",
      sections: "Sections",
      atAGlance: "At a Glance",
      whatsWorking: "What's working",
      whatsHindering: "What's hindering",
      quickWins: "Quick wins",
      ambitiousWorkflows: "Ambitious workflows",
      goals: "Goals",
      tools: "Tools",
      languages: "Languages",
      sessionTypes: "Session Types",
      projectAreas: "Project Areas",
      interactionStyle: "Interaction Style",
      keyPattern: "Key pattern",
      toolErrors: "Tool Errors",
      timeOfDay: "Time of Day",
      promptIntents: "Prompt Intents",
      responseTime: "Response Time",
      average: "Average",
      median: "Median",
      multiSession: "Multi-session usage",
      detectedIn: "Detected in",
      notDetected: "Not detected",
      workflowSignals: "Workflow Signals",
      subagentSessions: "Subagent sessions",
      mcpSessions: "MCP sessions",
      webSessions: "Web sessions",
      toolErrorSessions: "Tool-error sessions",
      highIterationSessions: "High-iteration sessions",
      gitCommitSessions: "Git commit sessions",
      averageFilesModified: "Average files modified",
      whatWorks: "What Works",
      friction: "Friction",
      suggestions: "Suggestions",
      kimiInstructions: "Kimi instructions additions",
      featuresToTry: "Features to try",
      usagePatterns: "Usage patterns",
      skillOpportunities: "Skill Opportunities",
      skillOpportunityNote: "Candidates are suggestions only. Apply them after confirming the scope.",
      trigger: "Trigger",
      why: "Why",
      scope: "Scope",
      risk: "Risk",
      horizon: "On The Horizon",
      funEnding: "Fun Ending",
      noData: "No data yet.",
      noEntries: "Evidence is not strong enough to show entries here yet.",
      weakEvidence: "Evidence is weak here; run /skill:insights after more substantial sessions for a richer narrative.",
      notAvailable: "n/a"
    };
  }
  return {
    title: "oh-my-kimicli 使用洞察",
    sessions: "会话",
    analyzed: "已分析",
    messages: "用户消息",
    toolCalls: "工具调用",
    files: "文件",
    activeDays: "活跃天数",
    language: "语言",
    languageEn: "英文",
    languageZh: "中文",
    languageMixed: "中英",
    unknown: "未知",
    sections: "Sections",
    atAGlance: "At a Glance",
    whatsWorking: "What's working",
    whatsHindering: "What's hindering",
    quickWins: "Quick wins",
    ambitiousWorkflows: "Ambitious workflows",
    goals: "Goals",
    tools: "Tools",
    languages: "Languages",
    sessionTypes: "Session Types",
    projectAreas: "Work Areas",
    interactionStyle: "Interaction Style",
    keyPattern: "Key pattern",
    toolErrors: "Tool Errors",
    timeOfDay: "Time of Day",
    promptIntents: "Prompt Intents",
    responseTime: "Response Time",
    average: "平均",
    median: "中位数",
    multiSession: "多会话使用",
    detectedIn: "检测到窗口数",
    notDetected: "未检测到",
    workflowSignals: "Workflow Signals",
    subagentSessions: "子智能体会话",
    mcpSessions: "MCP 会话",
    webSessions: "Web 会话",
    toolErrorSessions: "工具错误会话",
    highIterationSessions: "高迭代会话",
    gitCommitSessions: "Git commit 会话",
    averageFilesModified: "平均修改文件数",
    whatWorks: "What Works",
    friction: "Friction",
    suggestions: "Suggestions",
    kimiInstructions: "Kimi 指令补充",
    featuresToTry: "可尝试能力",
    usagePatterns: "使用模式",
    skillOpportunities: "Skill Opportunities",
    skillOpportunityNote: "这些只是候选建议，真正落地前需要先确认范围。",
    trigger: "触发场景",
    why: "原因",
    scope: "范围",
    risk: "风险",
    horizon: "Horizon",
    funEnding: "Closing Note",
    noData: "还没有足够数据。",
    noEntries: "证据还不够强，暂不列条目。",
    weakEvidence: "这里证据偏弱；多积累几个实质性 session 后再运行 /skill:insights 会更丰富。",
    notAvailable: "暂无"
  };
}
