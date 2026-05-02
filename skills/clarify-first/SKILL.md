---
name: clarify-first
description: Resolve execution-time uncertainty before making a consequential choice. Use during an active task when a concrete implementation detail is unclear, multiple valid approaches have different outcomes, or an action may affect important files/data/configuration. Do not use for unclear goals, scope, or requirements; use requirements-elicitation for that. Do not use for trivial choices or anything that can be safely inferred from context.
---

# Clarify First

Use this skill to avoid risky guessing during execution.

rule: **default to action; ask only when the answer changes the next action.**

## Boundary

| Use requirements-elicitation | Use clarify-first |
|---|---|
| Before work starts | While work is already in progress |
| The goal/scope is unclear | A specific execution choice is unclear |
| "What are we building?" | "How should this detail be handled?" |

If you are unsure which skill applies, ask:

- Would the answer redefine the task? Use `requirements-elicitation`.
- Would the answer choose between implementation paths? Use `clarify-first`.

## Ask Only For High-Impact Choices

Ask the user when all are true:

1. You have a concrete decision to make now.
2. There are at least two reasonable choices.
3. The choice affects behavior, data, compatibility, cost, security, or user-visible output.
4. The answer is not already inferable from the conversation, repo, config, tests, or existing patterns.

Do not ask for style nits, tiny defaults, obvious local conventions, or decisions where either path is easy to reverse.

## Tool Preference

Use `AskUserQuestion` when available; otherwise ask directly. Batch related concrete choices,
offer meaningful options with the recommended one first, and avoid fake "Other" options.

If you are a subagent, do not ask the end user directly. Report the ambiguity and recommended default to the parent agent.

## Question Shape

Use this compact form:

```text
I need one decision before continuing because [impact].

Recommended: [option] because [reason].
Other valid option: [option] if [tradeoff].

Which should I use?
```

For destructive or broad changes, be explicit:

```text
This affects [files/data/config/environments]. Please confirm [exact action] before I proceed.
```

## After The User Answers

1. Restate the decision in one sentence.
2. Continue immediately.
3. Do not re-ask unless a new high-impact uncertainty appears.

Example:

```text
Got it. I will keep the cache in memory for this change and avoid adding Redis. Continuing now.
```

## Fallback When The User Declines To Decide

If the user says "you decide", choose the smallest reversible option that matches existing project patterns. State the assumption briefly and continue.

```text
I will choose the smaller local change and keep it easy to replace later.
```
