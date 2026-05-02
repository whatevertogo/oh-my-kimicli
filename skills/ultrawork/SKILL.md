---
name: ultrawork
description: Autonomous high-throughput execution for complex tasks. Trigger when the user says ulw, ultrawork, keep going, finish it, complete this end-to-end, or asks for no-hand-holding work across multiple files, tests, investigation, or review. Uses omk-ralph hook state for persistence and omk-review as the final quality gate. Do not use for simple one-shot answers or tiny edits.
---

# Ultrawork

Rule: the user says what; Ultrawork decides how and keeps going.

Ultrawork is a coordinator, not a fixed list of OMK-only abilities. Use the current session's
available Kimi skills, native tools, project skills, user skills, and plugin skills as the source of
truth.

Use OMK Ralph persistence for every Ultrawork task:

```text
./.omk/state/ralph-state.json
```

Keep `completion_promise` as `OMK_RALPH_DONE` unless the user provides a clearer promise. Use
`max_iterations: -1` for no-hand-holding completion work.

## Start

1. State `ULTRAWORK MODE ENABLED` when responding directly.
2. Ensure Ralph state exists and has `"workflow": "ralph"` and `"status": "active"`.
3. Restate the target in one sentence.
4. Decide whether a Capability Selection Pass is useful.
5. Decide whether Plan Mode is required.
6. Create a concise todo list for the main shards.
7. Start work immediately after any required plan is approved.

The OMK Stop hook replays the original task while Ralph state is active. After `"done"`, the hook
injects `ralph/end.md` once for the final completion summary. `"blocked"` stops without that
summary because the task is not complete.

If Ralph state is missing, create it manually before doing other work:

```json
{
  "version": 1,
  "workflow": "ralph",
  "source_skill": "ultrawork",
  "status": "active",
  "task": "<original user task>",
  "completion_promise": "OMK_RALPH_DONE",
  "iteration": 0,
  "max_iterations": -1,
  "phase": "starting",
  "skill_selection_status": "not_evaluated",
  "selected_skills": [],
  "plan_required": "auto",
  "plan_status": "pending",
  "review_required": true,
  "reason": "ultrawork started",
  "evidence": ["initialized by ultrawork"],
  "updated_at": "<ISO-8601 timestamp>"
}
```

## Capability Selection Pass

Use this pass only when a discovered skill may materially change execution. Do not perform it as a
ceremony for small, obvious, or purely local tasks.

When useful, inspect the current session's Available Skills list. Consider Kimi built-in skills,
project skills, user skills, and plugin skills equally; OMK skills are not preferred by default.

For each likely useful skill:

1. Decide whether it would materially change execution.
2. Read its `SKILL.md` from the listed path only if likely useful.
3. Follow selected skill instructions during the task.

If you select skills, update Ralph state after this pass:

```json
{
  "skill_selection_status": "done",
  "selected_skills": [
    { "name": "<skill>", "reason": "<why it changes execution>" }
  ]
}
```

If no skill check is worth the overhead, leave `skill_selection_status` as `"not_evaluated"` and
continue. Do not write an empty selection just to satisfy a template.

Reconsider this pass when the task scope changes.

## Plan Gate

Use Kimi's native `EnterPlanMode` before execution when the task is non-trivial:

- new feature or meaningful behavior change
- multiple files or modules
- architecture, API, schema, permission, hook, or prompt-system change
- multiple valid approaches with different tradeoffs
- unclear scope or important user-visible choices
- broad cleanup/refactor where the plan affects safety

Skip Plan Mode only for small explicit fixes, pure read-only investigation, or small tasks where a
quick exploration is enough to choose an obvious path. For small tasks, explore briefly and execute
directly.

When Plan Mode is used, the plan must name selected skills, implementation shards, verification,
review gate, and Ralph completion condition. After `ExitPlanMode` approval, execute the approved
plan without re-planning unless new facts change the scope.

## Autonomy

Continue without asking when the repo, tests, docs, or user wording imply a reasonable
default. Asking on every minor decision defeats the point of Ultrawork — the whole reason
the user invoked this mode is to delegate and walk away.

Ask only when the next action needs:

- credentials or external access
- destructive changes
- approval for broad or irreversible edits
- a user-visible choice with materially different behavior, cost, compatibility, or security

If unsure and the choice is local, reversible, and low impact, choose the smallest change that matches existing patterns and record the assumption.

## Execution

Repeat until complete:

1. Pick the highest-leverage unfinished todo — what unblocks the most downstream work?
2. Gather missing context with project tools or focused subagents.
3. Delegate only independent shards with non-overlapping write scope — overlapping writes
   cause merge conflicts that waste time resolving.
4. Edit narrowly in local style.
5. Run the narrowest meaningful check — faster feedback means faster iteration.
6. Fix failures caused by this work.
7. Update todos and Ralph evidence — stale state causes duplicated or skipped work.

Do not stop at next steps when the next step is safe and available.
Keep Ralph evidence compact: command plus result, not raw output.

## Subagents

Subagents do not run Ultrawork, Ralph, plan approval, review gates, or final completion. The root
agent owns orchestration.

Use subagents only for bounded work:

- focused read-only exploration
- independent implementation shards
- plan or review critique
- verification that can run without blocking the root agent

Tell subagents to return concise findings, changed files, checks run, and blockers. After they
return, the root agent updates todos, Ralph evidence, selected skills, plan status, review status,
and final `done` or `blocked` state.

## Review Gate

Before marking Ralph `"done"`, run `omk-review` for meaningful code, config, prompt,
workflow, or documentation changes. The review catches regressions and quality issues
before the user sees them — skipping it means shipping blind.

Review target priority:

1. user-specified scope
2. files changed during Ultrawork
3. staged diff
4. working-tree or branch diff

If `omk-review` finds real Critical/High/Medium issues caused by this work:

1. fix them
2. re-run relevant verification
3. update review evidence
4. keep Ralph `"active"` until clean or blocked

## Stop

Mark `./.omk/state/ralph-state.json`:

- `"done"` only when the target is complete, verified, review-blocking issues are resolved, and
  `reason` or `evidence` includes `OMK_RALPH_DONE`
- `"blocked"` only when progress requires user input, credentials, approval, destructive action, or broader scope
- `"active"` while work remains

Final response:

```text
Outcome:
- ...

Changed:
- ...

Verified:
- ...

Review:
- ...

Remaining risk:
- ...
```

Keep it short. Completed final responses are driven by `ralph/end.md`; do not narrate the whole
internal process.
