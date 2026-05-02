---
name: insights
description: Generate an oh-my-kimicli usage insights report from KimiCLI sessions. Use when the user asks for usage insights, session analysis, work patterns, friction analysis, suggestions, skill opportunities, repeated-instruction analysis, or an insights report.
---

# OMK Insights

Generate a Claude Code style usage report from KimiCLI session history.

OMK prepares a bounded evidence pack. The current Kimi agent writes structured insight content. OMK renders the final HTML and JSON.

## Workflow

1. Run:

   `omk insights prepare <args>`

2. Read the generated `evidence-pack.md`. Treat it as the source of truth.

3. Write exactly one JSON object to the reported `insights-content.json` path.

4. The JSON must include:
   - `facets`
   - `sections.at_a_glance`
   - `sections.project_areas`
   - `sections.interaction_style`
   - `sections.what_works`
   - `sections.friction_analysis`
   - `sections.suggestions`
   - `sections.on_the_horizon`
   - `sections.skill_opportunities`
   - `quality`

5. Run:

   `omk insights render`

6. Final response includes only:
   - HTML report path
   - JSON report path
   - sessions scanned/analyzed
   - evidence limits or weak sections
   - one short question asking whether to create/update a skill, hook, or AGENTS.md instruction only when the report contains a concrete skill opportunity with action `create_skill`, `update_skill`, `add_hook`, or `add_agents_instruction`

## Analysis Rules

- Use the evidence pack content. Do not invent from generic instructions.
- Extract facets first.
- Generate section-level insights from facets.
- Write `At a Glance` last.
- Use second person when describing the user's working style.
- Do not treat tool counts as insights by themselves.
- Suggestions must reduce repeated work, lower failure rate, or preserve a stable user preference.
- Leave arrays empty when evidence is weak.
- Keep awkward translated headings in English.

## Boundaries

- Do not run bare `omk insights` unless the user explicitly asks for the prepare alias.
- Do not run removed quick-report flags.
- Do not run `kimi --print`.
- Do not manually scan `~/.kimi/sessions`.
- Do not write HTML yourself.
- Do not create or update skills, hooks, or AGENTS.md during this report run. Ask first.
