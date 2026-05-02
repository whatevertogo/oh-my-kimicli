export function generateHtmlReport(report) {
  const data = report.aggregated;
  const sections = report.sections;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>oh-my-kimicli insights</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #1f2933; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: 32px; margin: 0 0 6px; letter-spacing: 0; }
    h2 { margin: 28px 0 12px; font-size: 20px; }
    .muted { color: #667085; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 22px 0; }
    .stat, section { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .stat strong { display: block; font-size: 24px; }
    section { margin-top: 14px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: inherit; line-height: 1.55; }
    .bar { display: grid; grid-template-columns: minmax(120px, 220px) 1fr 48px; gap: 10px; align-items: center; margin: 8px 0; }
    .track { height: 12px; background: #e8edf3; border-radius: 999px; overflow: hidden; }
    .fill { height: 100%; background: #2563eb; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  </style>
</head>
<body>
<main>
  <h1>oh-my-kimicli insights</h1>
  <div class="muted">Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.kimiShareDir)}</div>
  <div class="stats">
    ${stat("Sessions", data.scannedSessions)}
    ${stat("Analyzed", data.analyzedSessions)}
    ${stat("Messages", data.totalUserMessages)}
    ${stat("Tool calls", data.totalToolCalls)}
    ${stat("Files", data.totalFilesModified)}
    ${stat("Active days", data.daysActive)}
  </div>
  ${section("At a Glance", sections.atAGlance)}
  <div class="grid">
    ${chartSection("Tools", data.toolCounts)}
    ${chartSection("Languages", data.languages)}
    ${chartSection("Outcomes", data.outcomes)}
    ${chartSection("Friction", data.friction)}
  </div>
  ${section("Project Areas", sections.projectAreas)}
  ${section("Interaction Style", sections.interactionStyle)}
  ${section("What Works", sections.whatWorks)}
  ${section("Friction Analysis", sections.frictionAnalysis)}
  ${section("Suggestions", sections.suggestions)}
  ${section("On The Horizon", sections.onTheHorizon)}
  ${section("Fun Ending", sections.funEnding)}
</main>
</body>
</html>
`;
}

function stat(label, value) {
  return `<div class="stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong></div>`;
}

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2><pre>${escapeHtml(body || "Unavailable.")}</pre></section>`;
}

function chartSection(title, map) {
  const entries = Object.entries(map || {}).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  const bars = entries.length
    ? entries
        .map(([key, value]) => {
          const count = Number(value) || 0;
          return `<div class="bar"><span>${escapeHtml(key)}</span><div class="track"><div class="fill" style="width:${Math.round((count / max) * 100)}%"></div></div><span>${escapeHtml(formatNumber(count))}</span></div>`;
        })
        .join("")
    : `<div class="muted">No data</div>`;
  return `<section><h2>${escapeHtml(title)}</h2>${bars}</section>`;
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
