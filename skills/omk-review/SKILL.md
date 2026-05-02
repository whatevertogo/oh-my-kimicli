---
name: omk-review
description: Perform focused code review after meaningful code, config, prompt, workflow, or documentation changes; before commit or PR; or whenever the user asks for review. Review the user-specified scope first, otherwise staged changes, working-tree changes, then branch diff. Cover security, correctness, tests, and architecture. Report real issues only and write the report under the current workspace .omk directory.
---

# omk-review

Review real risk, not style noise.

Report path:

```text
./.omk/CODE_REVIEW_ISSUES.md
```

Create `./.omk/` if needed.

## Target

Resolve review target in order:

1. user-specified files, directories, commits, branches, PRs, issues, staged area, or natural-language scope
2. staged diff
3. working-tree diff
4. branch diff against the default base branch

Do not broaden an explicit user target. If the target is ambiguous or missing, ask.

## Context

Gather enough to know:

- changed code or target content
- stack and package files
- lint/type/test config
- 2-3 nearby unchanged files for local patterns

If the framework or rules are unfamiliar after this, say it needs human review instead of guessing.

## Perspectives

Apply all four perspectives. Use subagents in parallel only when available and useful; otherwise do them yourself.

### Security

Report only exploitable issues introduced or modified by the target.

Check:

- untrusted input reaching SQL, shell, template, eval, filesystem, or network sinks
- real hardcoded secrets
- auth/authz bypass on actual paths
- unsafe deserialization of external data

Do not report generic validation advice or framework-mitigated issues.

### Correctness

Report realistic bugs:

- wrong output
- crashes
- async/null/error paths
- resource leaks
- misleading names that can cause misuse
- off-by-one or precedence bugs

Do not report pure style nits or harmless refactors.

### Tests

Report missing or invalid coverage for changed behavior:

- changed branches without tests
- tests that no longer cover the behavior
- assertions that trivially pass

Record test run results. Do not ask for generic "more tests".

### Architecture

Report changed cross-layer inconsistencies:

- frontend/backend contract mismatch
- type/interface change not propagated
- env var missing from examples/docs
- public API change missing version/changelog note

Do not report architectural preferences that match existing patterns.

## Confidence Filter

Keep an issue only if you would defend it as real in this codebase.

Separate:

- new issues caused by the target
- pre-existing issues not touched by the target
- low-confidence observations

Only new issues belong in the main report.

## Report

Write:

```markdown
# Code Review - [target]

## Summary
Files reviewed: X | New issues: Y (critical A, high B, medium C, low D) | Perspectives: 4/4

## Security
| Sev | Issue | File:Line | Attack path |
|-----|-------|-----------|-------------|
| ... | ... | ... | ... |

*No security issues found.*

## Correctness
| Sev | Issue | File:Line | Consequence |
|-----|-------|-----------|-------------|

## Tests
Run results: ...

| Sev | Untested scenario | Location |
|-----|-------------------|----------|

## Architecture
| Sev | Inconsistency | Files |
|-----|---------------|-------|

## Must Fix Before Merge
Critical/High only. If empty, say clear to merge.

## Pre-Existing Issues
- ...

## Low-Confidence Observations
- ...
```

If no issues exist, say so clearly in each relevant section.

## Completion

Before final response:

- write `./.omk/CODE_REVIEW_ISSUES.md`
- mention test results
- mention remaining risk or human-review need
