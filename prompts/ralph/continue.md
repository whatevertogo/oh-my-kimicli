OMK Ralph is still active. The previous turn ended before
`./.omk/state/ralph-state.json` reached `"done"` or `"blocked"`.

Original task:
{{TASK}}

Source skill:
{{SOURCE_SKILL}}

Completion promise:
`{{COMPLETION_PROMISE}}`

Current continuation:
{{ITERATION}} / {{MAX_ITERATIONS}}

Skill selection:
{{SKILL_SELECTION_STATUS}}

Selected skills:
{{SELECTED_SKILLS}}

Plan status:
{{PLAN_STATUS}}

Current reason:
{{REASON}}

Recorded evidence:
{{EVIDENCE}}

Continue from the current repository state.

## Rules

- Do the next concrete useful action now; do not only summarize progress.
- Read current files/diffs/tests/evidence before assuming state.
- If source skill is `ultrawork`, consider a lightweight Capability Selection Pass when a
  discovered skill may materially change execution.
- Use the current Available Skills list as the source of truth. If a likely skill exists, read that
  skill's `SKILL.md` and apply it.
- Do not perform a ceremonial empty skill-selection pass for small or obvious tasks. Leave
  `skill_selection_status` as `"not_evaluated"` when no extra skill check is worth the overhead.
- When you do select skills, update `./.omk/state/ralph-state.json` with
  `"skill_selection_status": "done"` and the selected skill names/reasons.
- If source skill is `ultrawork` and the task is non-trivial, use Kimi `EnterPlanMode` before
  implementation. For small tasks, explore briefly and execute directly.
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

Ultrawork skill selection:

```json
{
  "workflow": "ralph",
  "source_skill": "ultrawork",
  "status": "active",
  "skill_selection_status": "done",
  "selected_skills": [
    { "name": "<skill-name>", "reason": "<why this skill changes execution>" }
  ],
  "reason": "selected useful skills; continuing"
}
```

If you are not certain the task is complete and verified, keep working.
