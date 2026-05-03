---
name: omk-ralph
description: Keep working autonomously under the oh-my-kimicli Stop-hook Ralph system until the task is complete, verified, or honestly blocked. Use when the user says keep going, don't stop until done, just finish it, complete this end-to-end, plow through it, or similar no-hand-holding language. Also used by ultrawork as its persistence layer. Do not use for one-shot Q&A, simple lookups, or tasks that should stop after a normal single response.
---

# omk-ralph

Use OMK Ralph as a project-local replay loop.

State file:

```text
./.omk/state/ralph-state.json
```

The hook initializes this file for `/skill:omk-ralph ...`. While `status` is `"active"`, Stop
injects `prompts/ralph/continue.md` with the original task. When `status` becomes `"done"`, Stop
injects `prompts/ralph/end.md` once to summarize the Ralph turn, then allows the final stop.
`"blocked"` allows stop without the end summary because the task is not complete.

## State Contract

Keep valid JSON:

```json
{
  "version": 1,
  "workflow": "ralph",
  "status": "active",
  "task": "<original task>",
  "completion_promise": "OMK_RALPH_DONE",
  "iteration": 0,
  "max_iterations": -1,
  "reason": "<current state>",
  "evidence": ["<short proof>"],
  "updated_at": "<ISO-8601 timestamp>"
}
```

Statuses:

- `"active"`: keep working
- `"done"`: task is complete and verified
- `"blocked"`: progress requires user input, credentials, approval, destructive action, or broader scope

`max_iterations: -1` means unlimited. A positive value lets the hook mark the task blocked after
the limit is exceeded.

`completion_promise` is the phrase the hook uses to verify that the agent intentionally marked the state `"done"`. The hook looks for this exact string in the state file before finalizing. `OMK_RALPH_DONE` is the standard value. A caller (like ultrawork) may replace it with a more specific promise, but the hook requires the stop to include an agreed-upon token so a spurious `"done"` from a tool call does not end the session prematurely.

## Avoid Common Confusion

- The state file is the source of truth; saying "done" in chat is not enough.
- The path is the user's current project directory, not the package directory or global Kimi share dir.
- There is no `EnterRalphMode`, `ExitRalphMode`, or `<choice>CONTINUE</choice>` in OMK Ralph.
- After `"done"`, do not set the state back to `"active"` just to write the summary.
- Keep `evidence` short. Record command names/results and key observations, not raw logs or diffs.

## Work Rule

Treat the user's original task as the stop condition.

Continue while useful work remains. Do the next concrete action instead of describing future work.
Before `"done"`, run the narrowest meaningful proof: targeted tests, lint/typecheck, format check,
build, smoke test, or direct inspection when that is the right proof.

If a check fails because of your work, fix it and re-check. If it is unrelated, record that clearly.

## Finish

Write `"done"` only after completion and verification:

```json
{
  "workflow": "ralph",
  "status": "done",
  "task": "<original task>",
  "completion_promise": "OMK_RALPH_DONE",
  "reason": "task completed and verified: OMK_RALPH_DONE",
  "evidence": ["npm run check: passed"]
}
```

Write `"blocked"` with a concrete reason when blocked. The hook will allow the blocker response
without injecting `end.md`.
