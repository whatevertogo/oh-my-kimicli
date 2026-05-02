# oh-my-kimicli

External hook-first orchestration for Kimi Code CLI.

This package does not fork or patch KimiCLI. It installs:

- a KimiCLI plugin under the Kimi share directory
- a global oh-my-kimicli config at `~/.omk/config.json`
- workflow skills under `~/.kimi/skills`
- a managed hooks block in `config.toml`
- editable next-turn prompts under `prompts/`
- hook trace state under `<KIMI_SHARE_DIR or ~/.kimi>/oh-my-kimicli`
- optional Ralph evidence under `./.omk/state/ralph-state.json` in the current working directory
- a local git exclude entry for `./.omk/` in `.git/info/exclude` when hooks run inside a git repo

## Setup

Install from the GitHub repository:

```sh
bun install -g github:whatevertogo/oh-my-kimicli
omk setup
```

If your Bun/npm registry is set to a mirror and you later publish this package to npm, switch back
to the official registry first:

```sh
npm config set registry https://registry.npmjs.org/
```

The package is not published to npm yet, so `bun install -g oh-my-kimicli` will return 404 until it
is published.

After upgrading the package, run `omk setup --force` if you want to refresh the managed
skills from the new package version. Plain `omk setup` preserves existing skill directories.

For local development from this directory:

```sh
bun link
omk setup
```

The CLI entrypoint is TypeScript and uses a Bun shebang, so Bun must be available on `PATH`.

## Local Packages

Build release artifacts from the repository root:

```sh
bun run pack:all
```

This produces:

```text
dist/npm/oh-my-kimicli-0.1.0.tgz  # npm-generated package
dist/bun/oh-my-kimicli-0.1.0.tgz  # Bun-generated package
dist/bundle/omk.js                # Bun bundle smoke artifact
```

Install locally with npm:

```sh
npm install -g ./dist/npm/oh-my-kimicli-0.1.0.tgz
omk setup
```

Install locally with Bun:

```sh
bun install -g ./dist/bun/oh-my-kimicli-0.1.0.tgz
omk setup
```

The package intentionally ships the TypeScript sources plus `skills/`, `prompts/`, and `plugin/`.
Do not use a standalone compiled executable for setup: `omk setup` needs those package resources
on disk so it can install managed KimiCLI skills, prompts, hooks, and plugin files.

## Global Config

oh-my-kimicli reads user-level defaults from:

```text
~/.omk/config.json
```

`omk setup` and `omk config` create or normalize the file. Current default:

```json
{
  "version": 1,
  "features": {
    "pet": false
  }
}
```

`features.pet` is intentionally disabled by default and reserved for future pet integration. For
tests or isolated installs, set `OMK_HOME` to override the `~/.omk` directory.

To create or inspect the config without installing hooks:

```sh
omk config
```

## Commands

```sh
omk setup
omk uninstall
omk config
omk doctor
omk insights --no-llm
omk help
```

`omk hook` exists only as the internal hook entrypoint registered by `omk setup`. It is intentionally
not part of the public help surface.

`omk setup` registers `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`. Plan-mode prompts are gated on the actual KimiCLI session state: `EnterPlanMode` prompts are injected only after `plan_mode=true` is visible in session state. `ExitPlanMode` is not hooked by oh-my-kimicli; plan review happens inside plan mode before approval. `UserPromptSubmit` initializes OMK Ralph state for `/skill:omk-ralph ...`, and `Stop` continues while `./.omk/state/ralph-state.json` is active.

## Plan Mode Prompts

Edit these files to shape the next turn after KimiCLI plan tools are called:

```text
prompts/plan/enter-plan-mode-next-turn.md  # injected by the hook after native plan mode is active
prompts/plan/plan-template.md              # expanded into the enter prompt
prompts/plan/plan-mode-reentry.md          # reference prompt; not injected by default
```

HTML comments are stripped before injection. The enter prompt keeps KimiCLI native plan mode canonical, adds a subagent plan-audit gate before `ExitPlanMode`, and expands `{{PLAN_TEMPLATE}}` from `plan-template.md`.

## Ralph Loop

oh-my-kimicli implements Ralph continuation with the Stop hook and a project-local state file.
It does not depend on KimiCLI native Ralph mode.

Preferred interactive entry:

```text
/skill:omk-ralph <task>
```

When the skill runs, it records progress directly in the user's current working directory:

```text
./.omk/state/ralph-state.json
```

The hook uses:

```text
prompts/ralph/continue.md
prompts/ralph/end.md
```

`/skill:omk-ralph <task>` asks the agent to write active/done/blocked evidence to
`./.omk/state/ralph-state.json`. While the file has `"workflow": "ralph"` and
`"status": "active"`, the Stop hook blocks completion and injects `prompts/ralph/continue.md`.
The injected prompt replays the original task with current evidence, iteration count, and a
completion promise. It does not ask the model to output a branch token.

When the state becomes `"done"`, the Stop hook injects `prompts/ralph/end.md` once so the agent
summarizes the completed Ralph turn. The hook records `end_prompt_sent: true` and then allows the
next stop. `"blocked"` allows stop without `end.md`, because the task did not complete.

Default state:

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

`max_iterations: -1` means unlimited continuation. Set a positive number in the state file if you
want a local loop limit. Evidence is rendered compactly by the hook to avoid carrying full logs
between turns.

To exit a Ralph task, update the state file to `"done"` or `"blocked"`.

## Workflow Entry Points

After setup, start KimiCLI and use:

```text
/skill:ultrawork <task>
/skill:insights --no-llm
/skill:requirements-elicitation <task>
/skill:clarify-first <decision>
/skill:omk-ralph <task>
/skill:omk-review <scope>
```

`/skill:insights` is the KimiCLI-internal entrypoint for the deterministic `omk insights` engine.
Use `--no-llm` for a quick metrics-only report, or omit it to let OMK ask Kimi for narrative
facet analysis and report sections.

`/skill:ultrawork <task>` is the high-output orchestration mode. It asks KimiCLI to use
`omk-ralph` state discipline, shard work across subagents, integrate results, run
`omk-review` as the final quality gate, and verify before reporting completion. It is meant for
complex implementation, debugging, review, or multi-file work, not tiny one-line fixes.

`/skill:requirements-elicitation <task>` clarifies what should be built before execution starts.
`/skill:clarify-first <decision>` clarifies how to handle an execution detail after work has
already started.

## Notes

KimiCLI uses `KIMI_SHARE_DIR` for global data such as config, plugins, logs, sessions, and MCP. User skills are currently discovered from `~/.kimi/skills`, so this installer writes skills there even when `KIMI_SHARE_DIR` is set.
