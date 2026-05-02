# oh-my-kimicli

External hook-first orchestration for Kimi Code CLI — skills, automated workflows, and usage insights for KimiCLI.

## Philosophy

Everyone has their own oh-my-kimicli.

The centerpiece of oh-my-kimicli is **insights** — it doesn't tell you how to work; it shows you how you actually work. By analyzing your KimiCLI session history, insights identifies your work patterns, reveals friction points in how you collaborate with AI, surfaces repeated instructions and improvement signals, and ultimately delivers recommendations that are specific to you and you alone.

The remaining skills (ultrawork, omk-ralph, omk-review, requirements-elicitation, clarify-first) orbit this center — each person selectively enables and tunes them based on their own actual usage patterns, rather than copying someone else's setup. Your oh-my-kimicli is defined by your data.

## Installation

```sh
bun install -g github:whatevertogo/oh-my-kimicli
omk setup
```

> **Note:** This package is not yet published to npm. Use the GitHub URL above.
> `bun install -g oh-my-kimicli` will return 404.
>
> If your registry is configured with a mirror, switch back to the official registry first:
> ```sh
> npm config set registry https://registry.npmjs.org/
> ```

After upgrading the package, run `omk setup --force` to refresh managed skill files.
Plain `omk setup` preserves existing skill directories.

The CLI entrypoint is TypeScript with a Bun shebang — Bun must be on `PATH`.

## Skills

oh-my-kimicli installs 6 skills into KimiCLI, invoked via `/skill:<name>` in conversation.

### `/skill:ultrawork` — Autonomous High-Throughput Execution

A fully autonomous execution engine for complex tasks. Describe the goal; Ultrawork decides the strategy and keeps working until done.

- Uses omk-ralph state persistence for cross-turn automatic continuation
- Splits work into shards, delegates to subagents, integrates results
- Runs omk-review as a final quality gate before marking complete
- Ideal for multi-file changes, debugging, refactoring, code review, and complex implementation
- **Triggers:** `ulw`, `ultrawork`, `keep going`, `finish it`, `complete this`

### `/skill:omk-ralph` — Persistent Continuation Loop

Keeps KimiCLI working until the task is complete, bypassing the normal Stop behavior via a project-local state file.

- State file at `./.omk/state/ralph-state.json` tracks task, progress, and evidence
- `active` status triggers the Stop hook to inject continuation prompts automatically
- `done` status injects a one-time summary prompt, then allows normal stop
- `blocked` status pauses when user input is required
- `max_iterations: -1` for unlimited continuation; set a positive integer to cap turns
- **Triggers:** `/skill:omk-ralph <task>`, `keep going until done`

### `/skill:omk-review` — Multi-Perspective Code Review

Focused code review covering security, correctness, tests, and architecture before commit or PR.

- Auto-resolves review target: user-specified > staged diff > working-tree diff > branch diff
- **Security:** injection paths, hardcoded secrets, auth bypass, unsafe deserialization
- **Correctness:** logic errors, crash paths, async/null/error handling, resource leaks
- **Tests:** uncovered branches, broken tests, trivial assertions
- **Architecture:** cross-layer inconsistencies, unpropagated interface changes, public API changes
- Reports only confidence-filtered real issues; separates new issues from pre-existing and low-confidence observations
- Output written to `./.omk/CODE_REVIEW_ISSUES.md`
- **Triggers:** `review`, `code review`, before committing

### `/skill:insights` — Usage Analysis & Recommendations

Generates usage insights reports from KimiCLI session history, analyzing work patterns, friction points, and suggesting improvements.

- `omk insights message` produces a manifest, session packets, and a task brief for the current agent
- The current agent writes the local HTML + JSON reports directly; the skill no longer depends on a second render step or sections file
- Analysis dimensions: workflow signals, time-of-day patterns, friction details, repeated instructions, feature usage context
- Produces concrete, actionable recommendations — not just summary statistics
- Narrative reports include `skill_opportunities` and ask before creating/updating skills, hooks, or AGENTS.md instructions
- CLI mode (`omk insights`) is metrics-only and never spawns a nested kimi process
- `collect` / `render` were removed to avoid a drifting second report-generation pipeline
- **Triggers:** `/skill:insights`, `usage insights`, `session analysis`, `friction analysis`

### `/skill:requirements-elicitation` — Pre-Execution Requirements Clarification

Clarifies goals, scope, constraints, and acceptance criteria before building — prevents building the wrong thing.

- **Light mode:** cheap-to-fix tasks — quick confirmation then go
- **Standard mode:** wrong details cause partial rework — one compact batch of questions
- **Deep mode:** wrong direction wastes significant work — rounds of questions, outputs a requirements doc
- Covers six checkpoints: goal, user/audience, must-have scope, constraints, out-of-scope, done criteria
- Only asks what affects the result; never asks what can be inferred from the repo
- **Triggers:** under-specified requests like `build me an X`, `plan X`, `develop X`

### `/skill:clarify-first` — In-Execution Decision Confirmation

Resolves high-impact implementation decisions during active work. Division of labor with requirements-elicitation:

| requirements-elicitation | clarify-first |
|---|---|
| Before work starts, goal/scope unclear | During work, specific implementation choice unclear |
| "What are we building?" | "How should this detail be handled?" |

- Only asks when all three conditions hold: concrete decision + multiple reasonable options + affects behavior/data/compatibility/cost/security
- Provides a recommended option with reasoning
- Subagents return ambiguity and recommended defaults to the parent agent instead of asking the user directly
- **Triggers:** execution-time uncertainty, `clarify-first <decision>`

## Commands

```sh
omk setup              # Install plugin, skills, and hooks
omk setup --force      # Force-refresh all managed skills
omk uninstall          # Remove managed hooks, plugin, and skills
omk config             # Create or normalize ~/.omk/config.json
omk doctor             # Print machine-readable installation diagnostics
omk insights           # Generate a metrics-only KimiCLI usage report
omk insights message   # Generate manifest, session packets, and task brief for /skill:insights
omk insights paths     # Print insights artifact paths
omk help               # Show this help
```

`omk hook` is the internal hook entrypoint registered by `omk setup` and is not part of the public help surface.

## Global Config

oh-my-kimicli reads user-level defaults from `~/.omk/config.json`:

```json
{
  "version": 1,
  "features": {
    "pet": false
  }
}
```

`features.pet` is disabled by default, reserved for future pet integration. Set `OMK_HOME` to override the `~/.omk` directory for testing or isolated installs.

## Hook System

`omk setup` registers six hook events in KimiCLI's `config.toml`: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, and `StopFailure`.

- **UserPromptSubmit:** initializes Ralph state for `/skill:omk-ralph`
- **Stop:** blocks completion and injects continuation prompts while Ralph state is `active`
- **Plan mode prompts:** `EnterPlanMode` prompts are injected only after `plan_mode=true` is detected in session state; `ExitPlanMode` is not hooked — plan review completes inside plan mode

## Plan Mode Prompts

Editable prompt files for shaping plan mode behavior:

```text
prompts/plan/enter-plan-mode-next-turn.md  # injected after native plan mode is active
prompts/plan/plan-template.md              # expanded into the enter prompt
prompts/plan/plan-mode-reentry.md          # reference prompt; not injected by default
```

HTML comments are stripped before injection. The enter prompt preserves KimiCLI native plan mode behavior while adding a subagent plan-audit gate before `ExitPlanMode`.

## Ralph Loop

oh-my-kimicli implements Ralph continuation via the Stop hook and a project-local state file, without depending on KimiCLI's native Ralph mode.

**State file:** `./.omk/state/ralph-state.json`

```json
{
  "workflow": "ralph",
  "status": "active",
  "completion_promise": "OMK_RALPH_DONE",
  "iteration": 0,
  "max_iterations": -1,
  "evidence": []
}
```

**Workflow:**
1. `/skill:omk-ralph <task>` initializes state to `active`
2. Stop hook detects `active` status, injects `prompts/ralph/continue.md` with the original task and current evidence
3. On completion, set status to `done` — the hook injects `prompts/ralph/end.md` for a final summary
4. When blocked, set status to `blocked` — the hook allows normal stop

## Local Development

Build release artifacts from the repository root:

```sh
bun run pack:all
```

Artifacts:
```text
dist/npm/oh-my-kimicli-0.1.0.tgz  # npm-generated package
dist/bun/oh-my-kimicli-0.1.0.tgz  # Bun-generated package
dist/bundle/omk.js                # Bun bundle smoke artifact
```

Local development install:

```sh
bun link
omk setup
```

The package intentionally ships TypeScript sources plus `skills/`, `prompts/`, and `plugin/` directories — `omk setup` needs those package resources on disk to install managed KimiCLI skills, prompts, hooks, and plugin files.

## Notes

KimiCLI uses `KIMI_SHARE_DIR` for global data (config, plugins, logs, sessions, MCP). User skills are currently discovered from `~/.kimi/skills`, so this installer writes skills there even when `KIMI_SHARE_DIR` is set.
