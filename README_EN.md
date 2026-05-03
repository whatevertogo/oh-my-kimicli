# oh-my-kimicli

An external enhancement layer for Kimi Code CLI. It installs skills, hooks, prompt templates, and the `omk` helper command so KimiCLI works better for long-running, reviewable, personal engineering workflows.

oh-my-kimicli does not replace KimiCLI. It adds a maintainable workflow layer around KimiCLI's native capabilities:

- `/skill:insights` reviews your real session history and turns it into usage insights
- `/skill:omk-ralph` plus hooks keep a task moving until it is done or clearly blocked
- `/skill:ultrawork` organizes larger work into planning, execution, verification, and review
- `/skill:omk-review` produces focused review artifacts before commit or PR
- requirements and clarify skills reduce the cost of starting from unclear instructions

## Current Status

- Published package: `@whatevertogo/oh-my-kimicli`.
- KimiCLI integration: writes skills to `~/.kimi/skills` and registers hooks in `~/.kimi/config.toml`.
- Project-local state: Ralph and Ultrawork state lives under `./.omk/state/`.
- User config: `~/.omk/config.json`.

## Installation

Recommended npm install:

```sh
npm install -g @whatevertogo/oh-my-kimicli
omk setup
```

If you explicitly want Bun to manage global packages, you can also use:

```sh
bun install -g @whatevertogo/oh-my-kimicli
omk setup
```

Do not use:

```sh
bun install -g oh-my-kimicli
```

The unscoped `oh-my-kimicli` name is blocked by npm package-name similarity protection; use the scoped package name.

After installation, check the install:

```sh
omk doctor
```

For a development build, install from GitHub:

```sh
bun install -g github:whatevertogo/oh-my-kimicli
omk setup
```

## Updating

Recommended:

```sh
omk update
```

`omk update` uses npm by default for the published package and then refreshes managed skills/hooks:

```sh
npm uninstall -g oh-my-kimicli
npm uninstall -g @whatevertogo/oh-my-kimicli
npm install -g @whatevertogo/oh-my-kimicli
omk setup --force
```

`setup --force` only touches same-name managed skills that have an explicit OMK marker and have not been modified by the user. It does not overwrite unrelated user skills, and it does not overwrite managed skills you edited. For managed skills that are allowed to be replaced, the previous directory is backed up first:

```text
~/.kimi/skills/.omk-backups/<timestamp>/
```

Why not keep Bun as the default updater?

Bun is still the recommended development toolchain for this repo, but the npm package is aimed at regular KimiCLI users and should not require an extra runtime. If you want Bun to manage the global package, use `omk update --manager bun`.

On Windows, `omk update` schedules the update after the current `omk.exe` process exits. This avoids deleting the executable while it is still running. The update log is written to:

```text
~/.omk/update.log
```

Options:

```sh
omk update --dry-run                 # print the planned commands only
omk update --target github:owner/repo#branch
omk update --manager bun             # use Bun to manage the global package
omk update --no-setup                # update the global package without refreshing KimiCLI files
```

If your installed version does not have `omk update` yet, run the manual update once:

```sh
npm uninstall -g oh-my-kimicli
npm uninstall -g @whatevertogo/oh-my-kimicli
npm install -g @whatevertogo/oh-my-kimicli
omk setup --force
```

## Commands

```sh
omk setup              # Install plugin, skills, prompts, and hooks
omk setup --force      # Back up then refresh same-name managed skills
omk update             # Reinstall npm latest and refresh setup
omk uninstall          # Remove managed hooks, plugin, and skills
omk status             # Show project-local .omk workflow state
omk cancel             # Mark the project-local Ralph workflow as blocked
omk resume             # Mark the project-local Ralph workflow as active
omk clean              # Remove project-local .omk/state workflow state
omk config             # Create or normalize ~/.omk/config.json
omk doctor             # Print machine-readable installation diagnostics
omk review-target      # Print JSON describing the current code review target
omk insights prepare   # Generate the evidence pack used by /skill:insights
omk insights render    # Render HTML/JSON from insights-content.json
omk insights paths     # Print insights artifact paths
omk help               # Show help
```

`omk hook` is an internal hook entrypoint registered by `omk setup`; it is not part of the public command surface.

## Skills

`omk setup` installs 6 skills into `~/.kimi/skills`. Invoke them inside KimiCLI with `/skill:<name>`.

### `/skill:insights` — Usage Insights Report

Generates a personal usage report from KimiCLI session history. It is not a quick stats page; it is a Claude Code style two-stage pipeline:

```text
/skill:insights
  -> omk insights prepare
  -> current Kimi agent reads evidence-pack.md
  -> current Kimi agent writes insights-content.json
  -> omk insights render
  -> report.html / report.json
```

Artifacts:

```text
~/.omk/usage-data/insights/
├── evidence-pack.md
├── evidence-pack.json
├── insights-content.schema.json
├── insights-content.json
├── report.html
└── report.json
```

The report focuses on:

- projects and task types you work on most
- effective collaboration patterns with KimiCLI
- friction such as tool failures, repeated corrections, and interrupted tasks
- repeated user preferences and instructions
- workflows worth turning into a skill, hook, or AGENTS.md rule

Boundaries:

- does not start nested `kimi --print`
- does not make the external CLI call a model directly
- does not keep a quick stats page
- narrative content must come from the evidence pack and the current Kimi agent's analysis

### `/skill:omk-ralph` — Persistent Continuation Loop

Keeps KimiCLI working until the task is complete, clearly blocked, or reaches a configured iteration cap.

State file:

```text
./.omk/state/ralph-state.json
```

Basic state:

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

Behavior:

- `active`: the Stop hook blocks stopping and injects `prompts/ralph/continue.md`
- `done`: the Stop hook injects `prompts/ralph/end.md` once for final summary, then allows stop
- `blocked`: the hook allows stop because user input, credentials, approval, or a destructive action is required

This Ralph loop is implemented by oh-my-kimicli hooks and state files. It does not depend on KimiCLI's native Ralph mode.

### `/skill:ultrawork` — Large-Task Autonomous Execution

For multi-step, cross-file tasks that need verification. Ultrawork asks the agent to use stricter execution discipline:

- use KimiCLI native plan mode for large tasks
- select the skills needed for the current task instead of applying every skill blindly
- activate OMK Ralph state so work does not stop early
- keep evidence while executing
- run meaningful verification before finishing
- use `omk-review` as a final quality gate

Good fit:

- multi-file feature work
- systematic bug fixing
- complex refactors
- long code reviews
- "keep going until this is done" tasks

### `/skill:omk-review` — Focused Code Review

Writes a review artifact to:

```text
./.omk/CODE_REVIEW_ISSUES.md
```

Review target priority:

```text
user-specified scope > staged diff > working-tree diff > branch diff
```

Four perspectives:

- Security: exploitable injection, secrets, auth bypass, unsafe deserialization
- Code Quality: wrong output, crashes, or misleading behavior
- Tests: missing coverage for changed behavior, broken tests, trivial assertions
- Architecture: cross-layer mismatches, unpropagated type/interface changes, public API omissions

It tries to avoid noisy advice by reporting only issues it can defend, and separates new issues from pre-existing and low-confidence observations.

### `/skill:requirements-elicitation` — Pre-Execution Requirements Clarification

Use when the user's goal, scope, constraints, or acceptance criteria are unclear. It handles "what are we building?"

Modes:

- Light: cheap-to-fix tasks; confirm understanding quickly
- Standard: wrong details cause partial rework; ask one compact batch of questions
- Deep: wrong direction wastes significant work; ask in rounds and produce a requirements document

Principles:

- ask only questions that affect the result
- do not ask what can be inferred from the repo or context
- if the user says "just do it" or "you decide", stop asking and proceed with explicit assumptions

### `/skill:clarify-first` — In-Execution Decision Confirmation

Use when a high-impact implementation choice appears during execution. It handles "how should this detail be done?"

Trigger conditions:

- there is a concrete implementation decision
- at least two reasonable options exist
- the choice affects behavior, data, compatibility, cost, or safety

It should recommend a default with reasoning instead of pushing every small choice back to the user.

## Hook System

`omk setup` registers these hook events in KimiCLI's `config.toml`:

- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SubagentStop`
- `StopFailure`

Current responsibilities:

- initialize and continue Ralph state
- enforce Ultrawork/Ralph stop gates
- inject next-turn plan-mode prompts
- defensively block dangerous shell commands
- maintain workflow state and event logs

## Plan Mode Prompts

Editable files:

```text
prompts/plan/enter-plan-mode-next-turn.md
prompts/plan/plan-template.md
prompts/plan/plan-mode-reentry.md
```

Current policy:

- preserve KimiCLI native plan mode
- inject the next-turn prompt only after `plan_mode=true` is detected
- do not hook `ExitPlanMode`
- remind the agent to review the plan inside plan mode, through a subagent or self-review when appropriate

## Configuration

User config:

```text
~/.omk/config.json
```

Default:

```json
{
  "version": 1,
  "privacy": {
    "record_hook_prompts": false,
    "record_cwd": true,
    "redact_secrets": true,
    "redact_paths": false
  },
  "safety": {
    "block_destructive_shell": true,
    "warn_cleanup_dirs": true
  },
  "features": {
    "pet": false
  }
}
```

Hook prompts are not recorded by default, and common secret shapes are redacted. `features.pet` is currently disabled by default and reserved for future use. Use `OMK_HOME` to move `~/.omk` for tests or isolated installs.

## Uninstalling

```sh
omk uninstall
```

This removes oh-my-kimicli managed hooks, plugin files, and skills. It does not delete `~/.omk/usage-data` or project-local `./.omk` state directories.

Uninstall uses the OMK marker as the ownership boundary. Same-name user skills without a marker are kept. Managed skills with a marker but local edits are backed up to `~/.kimi/skills/.omk-backups/<timestamp>/` before being removed from KimiCLI's active skills.

To remove the global CLI:

```sh
npm uninstall -g oh-my-kimicli
npm uninstall -g @whatevertogo/oh-my-kimicli
```

## Local Development

```sh
bun install
bun test
bun run build
bun run check
bun run pack:all
```

Local link:

```sh
bun link
omk setup --force
```

Artifacts:

```text
dist/npm/whatevertogo-oh-my-kimicli-0.1.4.tgz
dist/bun/whatevertogo-oh-my-kimicli-0.1.4.tgz
dist/bin/omk.js
dist/bundle/omk.js
```

The npm package `bin` points at `dist/bin/omk.js`, the Node.js runtime artifact for users. The repo still ships TypeScript sources plus `skills/`, `prompts/`, and `plugin/` directories because `omk setup` needs those resources to install managed KimiCLI files.

## Path Reference

```text
~/.kimi/skills/                         # KimiCLI user skills
~/.kimi/plugins/oh-my-kimicli/          # installed plugin directory
~/.kimi/config.toml                     # hook registration target
~/.omk/config.json                      # OMK user config
~/.omk/usage-data/insights/             # insights report artifacts
./.omk/state/ralph-state.json           # project-local Ralph state
./.omk/CODE_REVIEW_ISSUES.md            # omk-review report
```

KimiCLI currently discovers user skills from `~/.kimi/skills`, so oh-my-kimicli writes managed skills there even when `KIMI_SHARE_DIR` is set.
