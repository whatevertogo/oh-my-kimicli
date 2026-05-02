OMK Ralph is still active. The previous turn ended before
`./.omk/state/ralph-state.json` reached `"done"` or `"blocked"`.

Original task:
{{TASK}}

Completion promise:
`{{COMPLETION_PROMISE}}`

Current continuation:
{{ITERATION}} / {{MAX_ITERATIONS}}

Current reason:
{{REASON}}

Recorded evidence:
{{EVIDENCE}}

Continue from the current repository state.

## Rules

- Do the next concrete useful action now; do not only summarize progress.
- Read current files/diffs/tests/evidence before assuming state.
- Run or improve verification when possible.
- If complete and verified, write `"status": "done"` and include `{{COMPLETION_PROMISE}}`.
- If user input, credentials, approval, destructive action, or broader scope is required, write
  `"status": "blocked"` with the concrete blocker.
- Otherwise keep `"status": "active"`.

## State Examples

Done:

```json
{
  "workflow": "ralph",
  "status": "done",
  "task": "<original task>",
  "completion_promise": "{{COMPLETION_PROMISE}}",
  "reason": "task completed and verified: {{COMPLETION_PROMISE}}",
  "evidence": ["npm run check: passed"]
}
```

Blocked:

```json
{
  "workflow": "ralph",
  "status": "blocked",
  "task": "<original task>",
  "completion_promise": "{{COMPLETION_PROMISE}}",
  "reason": "needs user approval before deleting files",
  "evidence": ["requested operation would remove tracked files"]
}
```

If you are not certain the task is complete and verified, keep working.
