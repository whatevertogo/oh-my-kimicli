---
name: requirements-elicitation
description: Clarify the user's goal, scope, constraints, audience, and acceptance criteria before execution when a request is under-specified and guessing would risk building the wrong thing. Trigger for broad requests like build, design, plan, write, or develop X without enough detail, or problem statements missing purpose, users, constraints, scale, must-have behavior, or done criteria. Do not trigger when the user gave enough detail, explicitly says just do it or you decide, or asks for a simple one-off. Use clarify-first later for execution-time decisions.
---

# Requirements Elicitation

Use this skill before work starts when the task itself is not clear enough.

rule: **do not interview by default. Ask only what prevents correct action.**

## Boundary

| Use requirements-elicitation | Use clarify-first |
|---|---|
| Before execution | During execution |
| Goal, scope, audience, constraints, or done criteria are unclear | A specific implementation detail is unclear |
| Avoid building the wrong thing | Avoid choosing the wrong method |

After requirements are confirmed, stop asking requirement questions and start executing. New implementation uncertainty belongs to `clarify-first`.

## Decide The Depth

Classify by redo cost:

- **Light**: wrong assumptions are cheap to fix. Restate your understanding and proceed after quick confirmation.
- **Standard**: wrong details cause partial rework. Ask one compact batch of questions, then summarize.
- **Deep**: wrong direction would waste the work. Ask in rounds, no more than 5 questions per round, then produce a short requirements document.

If unsure, use Standard.

## Six Checks

Only ask about missing checks that matter for this task:

1. **Goal**: Can you state the final deliverable in one sentence?
2. **User/audience**: Who will use or read it?
3. **Must-have scope**: What must be included?
4. **Constraints**: Stack, time, data, budget, environment, compatibility, policy?
5. **Out of scope**: What should not be included?
6. **Done criteria**: What proves it is complete?

If enough information is already present, do not ask. State assumptions if useful and start.

## Tool Preference

Use `AskUserQuestion` when available for Standard questions; otherwise ask directly. Batch related
questions, offer concrete options when they are real, and use free text when options would be fake.

If the task is a non-trivial implementation and the missing information is about approach, architecture, or multi-file scope, prefer `EnterPlanMode` when available.

If you are a subagent, do not ask the end user directly. Return the missing requirements and your recommended assumptions to the parent agent.

## Question Style

Ask in the user's language. Keep questions short and tied to impact.

Good:

```text
Before I start, I need three details that affect the result:

1. Who is the main user?
2. What must be included in v1?
3. What counts as done: runnable prototype, tests passing, or production-ready?
```

Avoid:

- Asking about details you can infer from the repo.
- Asking the user to choose internal implementation trivia.
- Splitting Standard-mode questions across many turns.

## Confirmation Output

After the user answers, summarize only what matters.

### Light

```text
I will build [deliverable] with [key behavior]. Starting now.
```

### Standard

```markdown
**Requirements Confirmed: [task]**
- Goal: ...
- Must include: ...
- Constraints: ...
- Out of scope: ...
- Done when: ...

Starting now.
```

### Deep

```markdown
## Requirements: [task]

### Goal
...

### Users
...

### Must Include
- ...

### Constraints
- ...

### Out Of Scope
- ...

### Done Criteria
- ...

### Assumptions
- ...
```

## Exit Rules

Stop asking and proceed with stated assumptions when:

- The user says "just do it", "you decide", or similar.
- The user gives enough information to avoid the major wrong path.
- Two rounds produce no new useful information.

Use the smallest reasonable assumption that follows the user's words and the current project.
