---
name: ultrawork
description: Autonomous high-throughput execution for complex tasks. Trigger when the user says ulw, ultrawork, keep going, finish it, complete this end-to-end, or asks for no-hand-holding work across multiple files, tests, investigation, or review. Uses omk-ralph hook state for persistence and omk-review as the final quality gate. Do not use for simple one-shot answers or tiny edits.
---

# Ultrawork

Rule: the user says what; Ultrawork decides how and keeps going.

Use OMK Ralph persistence:

```text
./.omk/state/ralph-state.json
```

Keep `completion_promise` as `OMK_RALPH_DONE` unless the user provides a clearer promise. Use
`max_iterations: -1` for no-hand-holding completion work.

## Start

1. State `ULTRAWORK MODE ENABLED` when responding directly.
2. Restate the target in one sentence.
3. Apply `omk-ralph`: ensure Ralph state is `"active"` with the original task recorded.
4. Create a concise todo list for the main shards.
5. Start work immediately.

The OMK Stop hook replays the original task while Ralph state is active. After `"done"`, the hook
injects `ralph/end.md` once for the final completion summary. `"blocked"` stops without that
summary because the task is not complete.

## Autonomy

Continue without asking when the repo, tests, docs, or user wording imply a reasonable default.

Ask only when the next action needs:

- credentials or external access
- destructive changes
- approval for broad or irreversible edits
- a user-visible choice with materially different behavior, cost, compatibility, or security

If unsure and the choice is local, reversible, and low impact, choose the smallest change that matches existing patterns and record the assumption.

## Execution

Repeat until complete:

1. Pick the highest-leverage unfinished todo.
2. Gather missing context with project tools or focused subagents.
3. Delegate only independent shards with non-overlapping write scope.
4. Edit narrowly in local style.
5. Run the narrowest meaningful check.
6. Fix failures caused by this work.
7. Update todos and Ralph evidence.

Do not stop at next steps when the next step is safe and available.
Keep Ralph evidence compact: command plus result, not raw output.

## Review Gate

Before marking Ralph `"done"`, run `omk-review` for meaningful code, config, prompt, workflow, or documentation changes.

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
