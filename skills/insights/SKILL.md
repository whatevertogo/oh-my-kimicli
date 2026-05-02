---
name: insights
description: Generate an oh-my-kimicli usage insights report from KimiCLI sessions. Use when the user asks for usage insights, session analysis, work patterns, friction analysis, suggestions, or an insights report.
---

# OMK Insights

Use the OMK collector, write the narrative sections as the current Kimi agent, then ask OMK to render the report.

Do not manually inspect session logs unless the collector fails.

## Workflow

1. Treat user-supplied flags as arguments for collect when they are relevant.
2. Run:

   `omk insights collect <args>`

3. Read the generated `insights-prompt.md` path from stdout.
4. Follow that prompt exactly:
   - read the bounded payload described by the prompt
   - write strict JSON to the reported `insights-sections.json`
   - use the schema in the prompt
   - write prose in `preferred_output_language`
   - ground suggestions in `workflow_signals`, `time_of_day`, `friction_details`, `user_instructions`, and `recommendation_context`
5. Run the reported render command:

   `omk insights render --sections <insights-sections.json>`

6. Final response includes only:
   - HTML report path
   - JSON report path
   - sessions scanned/analyzed
   - skipped data or sections, if any
   - one short question asking whether to apply any `skill_opportunities` by creating/updating a skill, hook, or AGENTS.md instruction

## Boundaries

- Do not run bare `omk insights` for the narrative workflow.
- Do not run `kimi --print`.
- Do not scan `~/.kimi/sessions` manually.
- Do not paste full raw transcripts into context.
- Do not translate command names, paths, skill names, or product names.
- Do not create or update skills from `skill_opportunities` during this skill run. Ask first.
- If the prompt or payload is too large, suggest `omk insights --no-llm` or rerun collect with a smaller `--limit` / `--facet-limit`.

## Examples

- `/skill:insights` -> `omk insights collect`
- `/skill:insights --limit 50` -> `omk insights collect --limit 50`
- `/skill:insights 少花点 token` -> `omk insights collect --facet-limit 10`
