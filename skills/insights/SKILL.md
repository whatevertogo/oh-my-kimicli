---
name: insights
description: Generate an oh-my-kimicli usage insights report from KimiCLI sessions. Use when the user asks for usage insights, session analysis, work patterns, friction analysis, or an insights report.
---

# OMK Insights

Run the deterministic OMK insights engine. Do not manually inspect sessions unless the command fails.

## Workflow

1. Treat extra user text as CLI arguments when it looks like flags.
2. Run `omk insights <args>` with the available shell tool.
3. If the user asks for a quick, local, or statistical report, prefer `--no-llm`.
4. If `omk` is unavailable, tell the user to run `omk setup` or use `omk insights` after installation.
5. Summarize only:
   - report HTML path
   - JSON path if produced
   - number of sessions scanned/analyzed
   - any failure or skipped capability

## Examples

- `/skill:insights` -> `omk insights`
- `/skill:insights --no-llm` -> `omk insights --no-llm`
- `/skill:insights 最近少花点 token` -> `omk insights --facet-limit 10`
