---
name: insights
description: Generate an oh-my-kimicli usage insights report from KimiCLI sessions. Use when the user asks for usage insights, session analysis, work patterns, friction analysis, suggestions, skill opportunities, repeated-instruction analysis, or an insights report.
---

# OMK Insights

Generate a usage report from KimiCLI session history. OMK collects bounded evidence and session packet files; the current agent writes the narrative report directly.

## Route

- Default narrative report: run `omk insights message <args>`.
- Quick, local, statistical, or `--no-llm` request: run `omk insights --no-llm <args>` and summarize paths/counts only.
- If `omk` is unavailable, ask the user to run `omk setup` or reinstall oh-my-kimicli.

Pass through relevant flags such as `--limit`, `--facet-limit`, and `--force`. For token-saving requests, prefer `--facet-limit 10`.

## Narrative Workflow

1. Run `omk insights message <args>`.
2. Read the generated `insights-agent-task.md`.
3. Read the generated `manifest.json`.
4. Read ranked session packet files from the manifest, starting with `recommended_read_mode: "deep"`.
5. Extract session facets and write `insights-facets.json`.
6. Generate the final `report.json` directly. It must include metrics, facets, sections, and quality notes.
7. Generate the final self-contained `report.html` directly from `report.json`.
8. Self-review before the final response:
   - facets were written before the report
   - At a Glance was written after the other sections
   - suggestions are evidence-backed
   - weak sections are omitted or moved to Evidence Notes
   - headings avoid awkward machine translation
   - skill opportunities exist only when repeated usage, clear friction, or high leverage is visible

Treat the task file as the authority for paths, limits, language guidance, report shape, and the final user question.

## Boundaries

- Do not run bare `omk insights` for the narrative workflow.
- Do not run `omk insights render`; that pipeline is intentionally removed.
- Do not run `kimi --print`.
- Do not manually scan `~/.kimi/sessions`.
- Do not paste full raw transcripts into context.
- Do not create or update skills, hooks, or AGENTS.md during the report run. Ask first.
- `No entries`, `暂无信息`, or an omitted section is valid when evidence is weak.
- Do not manufacture recommendations just to fill a section.
- If the task brief is insufficient, read the reported `insights-input.json` and session packet files. If they are too large, rerun with a smaller `--limit` or `--facet-limit`.

## Final Response

Report only:

- HTML report path
- JSON report path
- sessions scanned/analyzed
- weak-evidence sections or data limits, if any
- one short question asking whether to create or update a skill, hook, or AGENTS.md instruction only when the report has a concrete skill opportunity with action `create_skill`, `update_skill`, `add_hook`, or `add_agents_instruction`

If there is no reliable candidate, say that the current evidence is not strong enough to create a targeted skill yet.
