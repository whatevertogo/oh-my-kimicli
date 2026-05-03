type AnyRecord = Record<string, any>;

export function generateHtmlReport(report: AnyRecord) {
  const metrics = report.metrics || report.aggregated || {};
  const sections = report.sections || {};
  const quality = report.quality || {};
  const labels = htmlLabels(report.language || metrics.userLanguage?.code);
  return `<!doctype html>
<html lang="${escapeHtml(labels.lang)}">
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
      --soft: #f6f6f3;
      --text: #111114;
      --muted: #6f6f76;
      --line: #e7e4de;
      --line-strong: #d7d3ca;
      --accent: #111114;
      --accent-soft: #f0f1ff;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    main { width: min(1120px, calc(100vw - 36px)); margin: 0 auto; padding: 34px 0 64px; }
    header { padding: 16px 0 22px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
    .brand { font-size: 13px; letter-spacing: 0.18em; font-weight: 720; margin-bottom: 42px; }
    h1 { font-size: clamp(30px, 5vw, 56px); line-height: 1; margin: 0 0 14px; letter-spacing: 0; }
    h2 { font-size: 20px; margin: 0 0 14px; letter-spacing: 0; }
    h3 { font-size: 15px; margin: 16px 0 7px; letter-spacing: 0; }
    p { margin: 7px 0; line-height: 1.68; }
    a { color: inherit; }
    code { background: var(--soft); border: 1px solid var(--line); border-radius: 5px; padding: 2px 5px; }
    .muted { color: var(--muted); }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; background: var(--panel); color: var(--muted); font-size: 13px; }
    .nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
    .nav a { text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 7px 11px; background: rgba(255,255,255,.7); font-size: 13px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); margin: 18px 0; }
    .stat { padding: 13px 15px; border-right: 1px solid var(--line); min-height: 78px; }
    .stat:last-child { border-right: 0; }
    .stat strong { display: block; font-size: 24px; margin-top: 8px; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin-top: 14px; }
    .glance { display: grid; gap: 12px; }
    .glance-row { border-left: 3px solid var(--accent); padding-left: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 14px; }
    .item { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .item:first-child { border-top: 0; padding-top: 0; }
    .bar { display: grid; grid-template-columns: minmax(96px, 190px) 1fr 44px; gap: 10px; align-items: center; margin: 9px 0; font-size: 13px; }
    .track { height: 10px; background: #eeeeeb; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, #111114, #6872ff); }
    .copy { white-space: pre-wrap; word-break: break-word; background: #f7f7ff; border: 1px solid #dedfff; border-radius: 8px; padding: 11px; margin-top: 8px; }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 5px 0; }
    @media (max-width: 720px) {
      main { width: min(100vw - 24px, 1120px); padding-top: 22px; }
      .brand { margin-bottom: 28px; }
      .bar { grid-template-columns: 1fr; gap: 5px; }
    }
  </style>
</head>
<body>
<main>
  <header>
    <div class="brand">KIMI</div>
    <h1>${escapeHtml(labels.title)}</h1>
    <p class="muted">${escapeHtml(labels.subtitle)}</p>
    <div class="meta">
      <span class="pill">Generated ${escapeHtml(report.generatedAt || "")}</span>
      <span class="pill">${escapeHtml(report.kimiShareDir || "")}</span>
      <span class="pill">${escapeHtml(report.mode || "narrative")}</span>
    </div>
  </header>

  ${stats(metrics, labels)}
  ${nav(labels)}
  ${atAGlance(sections.at_a_glance, labels)}
  ${projectAreas(sections.project_areas, labels)}
  ${interactionStyle(sections.interaction_style, labels)}
  ${whatWorks(sections.what_works, labels)}
  ${frictionAnalysis(sections.friction_analysis, labels)}
  ${suggestions(sections.suggestions, labels)}
  ${skillOpportunities(sections.skill_opportunities, labels)}
  ${horizon(sections.on_the_horizon, labels)}
  ${metricsSection(metrics, report.facets_summary || {}, labels)}
  ${evidenceNotes(quality, labels)}
</main>
</body>
</html>`;
}

function stats(metrics: AnyRecord, labels: AnyRecord) {
  return `<div class="stats">
    ${stat(labels.sessions, metrics.scannedSessions)}
    ${stat(labels.analyzed, metrics.analyzedSessions)}
    ${stat(labels.messages, metrics.totalUserMessages)}
    ${stat(labels.tools, metrics.totalToolCalls)}
    ${stat(labels.errors, metrics.totalToolErrors)}
    ${stat(labels.files, metrics.totalFilesModified)}
    ${stat(labels.days, metrics.daysActive)}
  </div>`;
}

function stat(label: string, value: any) {
  return `<div class="stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong></div>`;
}

function nav(labels: AnyRecord) {
  return `<nav class="nav">
    <a href="#glance">At a Glance</a>
    <a href="#areas">Project Areas</a>
    <a href="#style">How You Use KimiCLI</a>
    <a href="#wins">Impressive Things</a>
    <a href="#friction">Where Things Go Wrong</a>
    <a href="#suggestions">Features to Try</a>
    <a href="#patterns">New Usage Patterns</a>
    <a href="#horizon">On the Horizon</a>
    <a href="#skills">Skill Suggestions</a>
    <a href="#metrics">Metrics</a>
  </nav>`;
}

function atAGlance(section: AnyRecord = {}, labels: AnyRecord) {
  return `<section id="glance"><h2>At a Glance</h2><div class="glance">
    ${glanceRow("What's working", section.whats_working, labels)}
    ${glanceRow("What's hindering you", section.whats_hindering, labels)}
    ${glanceRow("Quick wins to try", section.quick_wins, labels)}
    ${glanceRow("Ambitious workflows", section.ambitious_workflows, labels)}
  </div></section>`;
}

function glanceRow(title: string, body: any, labels: AnyRecord) {
  return `<div class="glance-row"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body || labels.noEvidence)}</p></div>`;
}

function projectAreas(section: AnyRecord = {}, labels: AnyRecord) {
  const areas = asArray(section.areas);
  if (!areas.length) return "";
  return `<section id="areas"><h2>Project Areas</h2>${areas
    .map(
      (area) =>
        `<div class="item"><h3>${escapeHtml(area.name)} <span class="muted">(${escapeHtml(formatNumber(area.session_count))})</span></h3><p>${escapeHtml(area.description)}</p></div>`
    )
    .join("")}</section>`;
}

function interactionStyle(section: AnyRecord = {}, labels: AnyRecord) {
  if (!section.narrative && !section.key_pattern) return "";
  return `<section id="style"><h2>How You Use KimiCLI</h2><p>${escapeHtml(section.narrative || labels.noEvidence)}</p><p><strong>Key pattern:</strong> ${escapeHtml(section.key_pattern || labels.noEvidence)}</p></section>`;
}

function whatWorks(section: AnyRecord = {}, labels: AnyRecord) {
  const items = asArray(section.impressive_workflows);
  if (!items.length && !section.intro) return "";
  return `<section id="wins"><h2>Impressive Things</h2><p>${escapeHtml(section.intro || "")}</p>${items
    .map((item) => `<div class="item"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div>`)
    .join("")}</section>`;
}

function frictionAnalysis(section: AnyRecord = {}, labels: AnyRecord) {
  const categories = asArray(section.categories);
  if (!categories.length && !section.intro) return "";
  return `<section id="friction"><h2>Where Things Go Wrong</h2><p>${escapeHtml(section.intro || "")}</p>${categories
    .map(
      (item) =>
        `<div class="item"><h3>${escapeHtml(item.category)}</h3><p>${escapeHtml(item.description)}</p>${bulletList(item.examples)}</div>`
    )
    .join("")}</section>`;
}

function suggestions(section: AnyRecord = {}, labels: AnyRecord) {
  const instructions = asArray(section.kimi_instructions_additions);
  const features = asArray(section.features_to_try);
  const patterns = asArray(section.usage_patterns);
  if (!instructions.length && !features.length && !patterns.length) return "";
  return `<section id="suggestions"><h2>Features to Try</h2>
    ${instructions.map((item) => suggestionItem(item.addition, item.why, item.prompt_scaffold)).join("")}
    ${features.map((item) => suggestionItem(item.feature, item.why_for_you || item.one_liner, item.example_code)).join("")}
    <h2 id="patterns">New Usage Patterns</h2>
    ${patterns.map((item) => suggestionItem(item.title, item.detail || item.suggestion, item.copyable_prompt)).join("")}
  </section>`;
}

function suggestionItem(title: any, body: any, copy: any) {
  return `<div class="item"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${copy ? `<div class="copy">${escapeHtml(copy)}</div>` : ""}</div>`;
}

function skillOpportunities(section: AnyRecord = {}, labels: AnyRecord) {
  const candidates = asArray(section.candidates);
  if (!candidates.length) return "";
  return `<section id="skills"><h2>Skill Suggestions</h2>${candidates
    .map(
      (item) =>
        `<div class="item"><h3>${escapeHtml(item.name)} <span class="muted">(${escapeHtml(item.recommended_action || "no_action")})</span></h3><p><strong>Trigger:</strong> ${escapeHtml(item.trigger)}</p><p><strong>Why:</strong> ${escapeHtml(item.why)}</p>${bulletList(item.evidence_sessions)}<p>${escapeHtml(item.expected_behavior || "")}</p>${item.starter_prompt ? `<div class="copy">${escapeHtml(item.starter_prompt)}</div>` : ""}</div>`
    )
    .join("")}</section>`;
}

function horizon(section: AnyRecord = {}, labels: AnyRecord) {
  const opportunities = asArray(section.opportunities);
  if (!opportunities.length && !section.intro) return "";
  return `<section id="horizon"><h2>On the Horizon</h2><p>${escapeHtml(section.intro || "")}</p>${opportunities
    .map(
      (item) =>
        `<div class="item"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.whats_possible)}</p><p>${escapeHtml(item.how_to_try)}</p>${item.copyable_prompt ? `<div class="copy">${escapeHtml(item.copyable_prompt)}</div>` : ""}</div>`
    )
    .join("")}</section>`;
}

function metricsSection(metrics: AnyRecord, facetsSummary: AnyRecord, labels: AnyRecord) {
  return `<section id="metrics"><h2>Metrics</h2><div class="grid">
    ${chart("Tools", metrics.toolCounts)}
    ${chart("Tool Errors", metrics.toolErrorCategories)}
    ${chart("Languages", metrics.languages)}
    ${chart("Facet Outcomes", facetsSummary.outcomes)}
    ${chart("Friction Types", facetsSummary.friction)}
    ${chart("Prompt Intents", metrics.workflowSignals?.prompt_intents)}
  </div></section>`;
}

function evidenceNotes(quality: AnyRecord, labels: AnyRecord) {
  const notes = [...asArray(quality.data_limits), ...asArray(quality.omitted_sections).map((item) => `Omitted: ${item}`)];
  if (!notes.length && !quality.evidence_strength) return "";
  return `<section id="evidence"><h2>Evidence Notes</h2><p><strong>Evidence strength:</strong> ${escapeHtml(quality.evidence_strength || "unknown")}</p>${bulletList(notes)}</section>`;
}

function chart(title: string, map: AnyRecord) {
  const entries = Object.entries(map || {}).slice(0, 10);
  if (!entries.length) return "";
  const max = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
  return `<div><h3>${escapeHtml(title)}</h3>${entries
    .map(([key, value]) => {
      const count = Number(value) || 0;
      return `<div class="bar"><span>${escapeHtml(labelize(key))}</span><div class="track"><div class="fill" style="width:${Math.round((count / max) * 100)}%"></div></div><span>${escapeHtml(formatNumber(count))}</span></div>`;
    })
    .join("")}</div>`;
}

function bulletList(items: any) {
  const list = asArray(items).filter(Boolean);
  return list.length ? `<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : String(value ?? "0");
}

function labelize(value: any) {
  return String(value || "unknown").replace(/_/g, " ");
}

function htmlLabels(language: any): AnyRecord {
  const zh = String(language || "").toLowerCase().startsWith("zh");
  return {
    lang: zh ? "zh-CN" : "en",
    title: zh ? "oh-my-kimicli 使用洞察" : "oh-my-kimicli insights",
    subtitle: zh
      ? "基于 KimiCLI session 证据生成的使用复盘。"
      : "A usage review generated from KimiCLI session evidence.",
    sessions: zh ? "会话" : "Sessions",
    analyzed: zh ? "分析" : "Analyzed",
    messages: zh ? "消息" : "Messages",
    tools: zh ? "工具" : "Tools",
    errors: zh ? "错误" : "Errors",
    files: zh ? "文件" : "Files",
    days: zh ? "天数" : "Days",
    noEvidence: zh ? "证据不足。" : "Not enough evidence."
  };
}
