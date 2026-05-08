---
name: omk-review
description: Perform focused code review after meaningful code, config, prompt, workflow, or documentation changes; before commit or PR; or whenever the user asks for review. Uses parallel subagents for 4-perspective review (security, correctness, tests, architecture). Report real issues only and write the report under the current workspace .omk directory.
---

# omk-review

Focused multi-perspective review. Surface genuine issues, not filler.

Report path:

```text
./.omk/CODE_REVIEW_ISSUES.md
```

Create `./.omk/` if needed.

---

## 1. Environment Detection

Detect first:

| Capability | With subagents | Without subagents |
|---|---|---|
| Review mode | Run 4 perspectives in parallel via subagents | Run 4 perspectives sequentially yourself |
| Run tests | via bash | via bash |
| Output file | `CODE_REVIEW_ISSUES.md` | `CODE_REVIEW_ISSUES.md` |

If subagents are unavailable, apply each perspective one by one and label them clearly.

---

## 2. Target

Resolve review target in order:

1. user-specified files, directories, commits, branches, PRs, issues, staged area, or natural-language scope
2. staged diff
3. working-tree diff
4. branch diff against the default base branch

Do not broaden an explicit user target. If the target is ambiguous or missing, ask.

When the user did not specify a target, run:

```sh
omk review-target
```

Use the returned JSON as the review target. If it reports `"target": "none"`, ask the user what to review instead of inventing a scope.

---

## 3. Context Gathering

Collect before reviewing:

1. Changed files and diffs (`git diff main` or staged diff)
2. Project stack (`package.json`, `pyproject.toml`, `go.mod`, `Gemfile`, etc.)
3. Conventions/config (`tsconfig.json`, `.eslintrc`, `ruff.toml`, `.prettierrc`, `biome.json`, etc.)
4. 2–3 unchanged files from the same module for local patterns

**Exit condition**: You know the framework, active rules, and local coding patterns.
If not, stop and ask the user.

---

## 4. Apply 4 Review Perspectives

### 4.0 Subagent Prompt Template

When spawning subagents, each one receives a message in this structure:

```
You are the [PERSPECTIVE] reviewer. Your job is to find REAL issues, not generate filler.

**Project context**
- Stack: [e.g. Node 20, Express, PostgreSQL]
- Active rules: [e.g. ESLint airbnb, strict TypeScript]
- Local patterns: [e.g. all DB calls go through db/query.ts, errors bubble as Result<T>]

**Diff**
[paste full diff here]

**Your scope**
[paste the relevant "Check" and "Do NOT flag" lists from section 4.x below]

**Output rules**
- Burden of proof is on you. If unsure, omit or move to low-confidence.
- For every issue: severity, file:line, what is wrong, why it's not a false positive, concrete fix.
- If nothing found: say "No [perspective] issues found." This is a valid outcome.
- Do not add generic best-practice advice unrelated to this diff.
```

Each subagent's scope comes directly from its section below (4.1–4.4).

### 4.1 Security

**Scope**: Real exploitable vulnerabilities introduced by this diff.

**Only report if all are true**:
1. The issue is introduced or modified in this diff
2. A plausible attack path exists from input to impact
3. Existing framework/middleware does not already mitigate it

**Check**:
- Unsanitized input reaching SQL/shell/template/eval/filesystem/network sinks
- Real hardcoded secrets
- Auth/authz bypasses on actual paths
- Unsafe deserialization of external data

**Do NOT flag**:
- Browser-only JS "SQL injection"
- Missing HTTPS when TLS is clearly upstream
- XSS where templates auto-escape by default
- Generic input-validation advice without a concrete path
- Test-only issues unless they expose real credentials

### 4.2 Correctness

**Scope**: Correctness bugs, crashes, or misleading behavior.

**Only report if**:
- It can realistically produce wrong output or a crash, or
- It materially misleads future maintainers

**Check**:
- Logic errors
- Null/async error paths that can fail in production
- Resource leaks with unclear lifetime
- Misleading names that can cause misuse
- Off-by-one / precedence bugs

**Do NOT flag**:
- Pure style nits
- Missing comments on obvious code
- Refactors with no correctness impact
- Small intentional duplication
- Complexity appropriate to the task

### 4.3 Tests

**Scope**: Missing or invalid coverage for changed behavior.

**Check**:
- Changed branches/conditions with no test
- Existing tests no longer covering changed behavior
- Assertions that trivially pass without testing real logic

**Do NOT flag**:
- Trivial config/constants/pass-throughs
- Test style unless broken
- Generic "add more tests"
- Coverage targets without naming a missing branch

**Also report**: test run results (pass / fail / skip).

### 4.4 Architecture & Consistency

**Scope**: Cross-layer inconsistencies introduced by this diff.

**Check**:
- Frontend/backend contract mismatches
- Type/interface changes not propagated
- New env vars missing from `.env.example` or docs
- Public API changes missing version/changelog updates

**Do NOT flag**:
- Architectural preferences that match existing patterns
- "Should be a separate service"
- Pre-existing inconsistencies untouched by this diff

---

## 5. Aggregate

Apply the confidence filter before reporting:

> Would I confidently defend this as a real issue in this codebase?

- If yes: keep it
- If unsure: move to low-confidence appendix or drop

Separate **new issues** from **pre-existing issues**.
Only new issues belong in the main report.

---

## 6. Report Format

```markdown
# Code Review - [target]

## Summary
Files reviewed: X | New issues: Y (Z critical, A high, B medium, C low) | Perspectives: 4/4

---

## Security
| Sev | Issue | File:Line | Attack path |
|-----|-------|-----------|-------------|
| High | `req.query.id` passed unsanitized to `db.raw()` | src/users.js:45 | GET /users?id=1 OR 1=1 → full table read |

*No security issues found.*

---

## Correctness
| Sev | Issue | File:Line | Consequence |
|-----|-------|-----------|-------------|
| Medium | `fetchUser()` has no catch and rejection escapes | src/api.js:88 | Unhandled rejection may crash Node ≥15 |

---

## Tests
**Run results**: X passed, Y failed, Z skipped

| Sev | Untested scenario | Location |
|-----|-------------------|----------|
| Low | `applyDiscount()` lacks test for `amount < 0` | src/pricing.js:22 |

---

## Architecture
| Sev | Inconsistency | Files |
|-----|---------------|-------|
| High | Backend `UserDTO` added `role`; frontend type not updated | api/user.go:14, web/types.ts:8 |

---

## Must Fix Before Merge
*(Critical/High only. If empty, diff is clear to merge.)*

1. **[SEC-001]** `db.raw()` injection — `src/users.js:45`
   - Impact: Full users table read
   - Fix: Use parameterized query

---

## Pre-Existing Issues (not blocking)
- ...

---

## Low-Confidence Observations
- ...
```

If no issues exist, say so clearly in each relevant section.

---

## 7. Special Cases

- **Small diff**: still apply all 4 perspectives
- **Unfamiliar framework**: say "needs human review", do not guess
- **Test failures**: record them, do not auto-block review
- **Perspective disagreement**: mark as "Needs Discussion"
- **Large diff (>20 files)**: batch by module, spawn subagents per batch

---

## 8. Completion

Before final response:

- [ ] Context gathered
- [ ] All 4 perspectives applied (parallel subagents if available)
- [ ] Confidence filter applied
- [ ] New vs pre-existing issues separated
- [ ] `./.omk/CODE_REVIEW_ISSUES.md` written
- [ ] Mention test results
- [ ] Mention remaining risk or human-review need
