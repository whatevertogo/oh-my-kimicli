export function generateHtmlReport(report) {
  const data = report.aggregated || {};
  const sections = report.sections || {};
  return `<!doctype html>
<html lang="${escapeHtml(htmlLang(data))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>oh-my-kimicli insights</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fb; color: #18212f; }
    main { max-width: 1180px; margin: 0 auto; padding: 34px 20px 58px; }
    h1 { margin: 0 0 6px; font-size: 34px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 14px 0 6px; font-size: 15px; letter-spacing: 0; }
    p { line-height: 1.58; margin: 7px 0; }
    code { background: #edf2f7; border: 1px solid #d9e2ec; border-radius: 5px; padding: 2px 5px; }
    .muted { color: #667085; }
    .hero { margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 22px 0; }
    .stat, section { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .stat strong { display: block; font-size: 24px; margin-top: 3px; }
    section { margin-top: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .bar { display: grid; grid-template-columns: minmax(110px, 220px) 1fr 48px; gap: 10px; align-items: center; margin: 8px 0; }
    .track { height: 12px; background: #e8edf3; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: #2563eb; }
    .list { padding-left: 20px; margin: 8px 0 0; }
    .item { border-top: 1px solid #edf0f5; padding-top: 10px; margin-top: 10px; }
    .copy { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #d9e2ec; border-radius: 6px; padding: 10px; margin-top: 8px; }
  </style>
</head>
<body>
<main>
  <div class="hero">
    <h1>oh-my-kimicli insights</h1>
    <div class="muted">Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.kimiShareDir)} (${escapeHtml(report.mode || "report")})</div>
  </div>
  <div class="stats">
    ${stat("Sessions", data.scannedSessions)}
    ${stat("Analyzed", data.analyzedSessions)}
    ${stat("Messages", data.totalUserMessages)}
    ${stat("Tool calls", data.totalToolCalls)}
    ${stat("Files", data.totalFilesModified)}
    ${stat("Active days", data.daysActive)}
    ${stat("Language", data.userLanguage?.label || "unknown")}
  </div>
  ${atAGlance(sections.at_a_glance)}
  <div class="grid">
    ${chartSection("Goals", data.goalCategories)}
    ${chartSection("Tools", data.toolCounts)}
    ${chartSection("Languages", data.languages)}
    ${chartSection("Session Types", data.sessionTypes)}
  </div>
  ${projectAreas(sections.project_areas)}
  ${interactionStyle(sections.interaction_style)}
  <div class="grid">
    ${responseTime(data)}
    ${chartSection("Tool Errors", data.toolErrorCategories)}
    ${chartSection("Time of Day", data.timeOfDay)}
    ${chartSection("Prompt Intents", data.workflowSignals?.prompt_intents)}
  </div>
  ${workflowSignals(data.workflowSignals)}
  ${whatWorks(sections.what_works)}
  ${frictionAnalysis(sections.friction_analysis)}
  ${skillOpportunities(sections.skill_opportunities)}
  ${suggestions(sections.suggestions)}
  ${horizon(sections.on_the_horizon)}
  ${funEnding(sections.fun_ending)}
</main>
</body>
</html>
`;
}

function stat(label, value) {
  return `<div class="stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong></div>`;
}

function atAGlance(section = {}) {
  return `<section><h2>At a Glance</h2>
    ${paragraph("What's working", section.whats_working)}
    ${paragraph("What's hindering", section.whats_hindering)}
    ${paragraph("Quick wins", section.quick_wins)}
    ${paragraph("Ambitious workflows", section.ambitious_workflows)}
  </section>`;
}

function projectAreas(section = {}) {
  const areas = Array.isArray(section.areas) ? section.areas : [];
  const body = areas.length
    ? areas
        .map(
          (area) =>
            `<div class="item"><h3>${escapeHtml(area.name)} <span class="muted">(${escapeHtml(formatNumber(area.session_count))} sessions)</span></h3><p>${escapeHtml(area.description)}</p></div>`
        )
        .join("")
    : `<p class="muted">No project area narrative available.</p>`;
  return `<section><h2>Project Areas</h2>${body}</section>`;
}

function interactionStyle(section = {}) {
  return `<section><h2>Interaction Style</h2>
    <p>${escapeHtml(section.narrative || "Unavailable.")}</p>
    <p><strong>Key pattern:</strong> ${escapeHtml(section.key_pattern || "Unavailable.")}</p>
  </section>`;
}

function whatWorks(section = {}) {
  const workflows = Array.isArray(section.impressive_workflows) ? section.impressive_workflows : [];
  return `<section><h2>What Works</h2>
    <p>${escapeHtml(section.intro || "Unavailable.")}</p>
    ${itemList(workflows, (item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>`)}
  </section>`;
}

function frictionAnalysis(section = {}) {
  const categories = Array.isArray(section.categories) ? section.categories : [];
  return `<section><h2>Friction</h2>
    <p>${escapeHtml(section.intro || "Unavailable.")}</p>
    ${itemList(
      categories,
      (item) =>
        `<h3>${escapeHtml(item.category)}</h3><p>${escapeHtml(item.description)}</p>${bulletList(item.examples)}`
    )}
  </section>`;
}

function suggestions(section = {}) {
  return `<section><h2>Suggestions</h2>
    <h3>Kimi instructions additions</h3>
    ${itemList(section.kimi_instructions_additions, (item) => `<p><strong>${escapeHtml(item.addition)}</strong></p><p>${escapeHtml(item.why)}</p>${copyBlock(item.prompt_scaffold)}`)}
    <h3>Features to try</h3>
    ${itemList(section.features_to_try, (item) => `<p><strong>${escapeHtml(item.feature)}</strong> - ${escapeHtml(item.one_liner)}</p><p>${escapeHtml(item.why_for_you)}</p>${copyBlock(item.example_code)}`)}
    <h3>Usage patterns</h3>
    ${itemList(section.usage_patterns, (item) => `<p><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(item.suggestion)}</p><p>${escapeHtml(item.detail)}</p>${copyBlock(item.copyable_prompt)}`)}
  </section>`;
}

function skillOpportunities(items = []) {
  const opportunities = Array.isArray(items) ? items : [];
  return `<section><h2>Skill Opportunities</h2>
    <p class="muted">Candidates are suggestions only. Apply them after confirming the scope.</p>
    ${itemList(
      opportunities,
      (item) =>
        `<h3>${escapeHtml(item.name)} <span class="muted">(${escapeHtml(item.recommended_action || "no_action")})</span></h3>
        <p><strong>Trigger:</strong> ${escapeHtml(item.trigger)}</p>
        <p><strong>Why:</strong> ${escapeHtml(item.why)}</p>
        ${bulletList(item.evidence)}
        <p><strong>Scope:</strong> ${escapeHtml(item.proposed_scope)}</p>
        <p><strong>Risk:</strong> ${escapeHtml(item.risk)}</p>
        ${copyBlock(item.example_prompt)}`
    )}
  </section>`;
}

function horizon(section = {}) {
  return `<section><h2>On The Horizon</h2>
    <p>${escapeHtml(section.intro || "Unavailable.")}</p>
    ${itemList(section.opportunities, (item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.whats_possible)}</p><p>${escapeHtml(item.how_to_try)}</p>${copyBlock(item.copyable_prompt)}`)}
  </section>`;
}

function funEnding(section = {}) {
  return `<section><h2>Fun Ending</h2><h3>${escapeHtml(section.headline || "Unavailable.")}</h3><p>${escapeHtml(section.detail || "")}</p></section>`;
}

function responseTime(data) {
  return `<section><h2>Response Time</h2>
    <p><strong>Average:</strong> ${escapeHtml(formatSeconds(data.averageResponseSeconds))}</p>
    <p><strong>Median:</strong> ${escapeHtml(formatSeconds(data.medianResponseSeconds))}</p>
    <p><strong>Multi-session usage:</strong> ${data.multiSessionUsage?.detected ? `Detected in ${escapeHtml(formatNumber(data.multiSessionUsage.windows))} window(s)` : "Not detected"}</p>
  </section>`;
}

function workflowSignals(signals = {}) {
  const rows = [
    ["Subagent sessions", signals.sessions_with_subagents],
    ["MCP sessions", signals.sessions_with_mcp],
    ["Web sessions", signals.sessions_with_web],
    ["Tool-error sessions", signals.sessions_with_tool_errors],
    ["High-iteration sessions", signals.high_iteration_sessions],
    ["Git commit sessions", signals.git_commit_sessions],
    ["Average files modified", signals.average_files_modified]
  ];
  return `<section><h2>Workflow Signals</h2>
    ${rows
      .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatNumber(value || 0))}</p>`)
      .join("")}
  </section>`;
}

function paragraph(label, body) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(body || "Unavailable.")}</p>`;
}

function chartSection(title, map) {
  const entries = Object.entries(map || {}).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  const bars = entries.length
    ? entries
        .map(([key, value]) => {
          const count = Number(value) || 0;
          return `<div class="bar"><span>${escapeHtml(labelize(key))}</span><div class="track"><div class="fill" style="width:${Math.round((count / max) * 100)}%"></div></div><span>${escapeHtml(formatNumber(count))}</span></div>`;
        })
        .join("")
    : `<div class="muted">No data</div>`;
  return `<section><h2>${escapeHtml(title)}</h2>${bars}</section>`;
}

function itemList(items, render) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length ? list.map((item) => `<div class="item">${render(item)}</div>`).join("") : `<p class="muted">No entries.</p>`;
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

function formatSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number)}s` : "n/a";
}

function labelize(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function htmlLang(data) {
  return data.userLanguage?.code === "zh" ? "zh-CN" : "en";
}
