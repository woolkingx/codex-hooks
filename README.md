# codex-hooks

Schema-first operating layer for Codex hooks.

`codex-hooks` turns Codex lifecycle hooks into validated, stateful, project-scoped policy features. It sits above raw `hooks.json` scripts and gives Codex a control plane for hook diagnostics, rule compilation, state ownership, deployment, and verification.

Codex hooks are powerful, but operating them directly can be brittle: a hook may not be trusted, may run from a surprising `cwd`, may miss a tool path, may emit invalid JSON, may lose state after compaction, or may be too noisy to use on every tool call. `codex-hooks` makes those problems explicit objects instead of one-off shell glue.

What it provides:

- **Schema-owned hook runtime**: official Codex hook input and output are validated at the event boundary.
- **Policy compiler path**: natural-language requirements become `policy/user.json` plus runtime rule projections.
- **Stateful features**: hook state is owned by the status layer, scoped by project/cwd, and resettable across lifecycle events.
- **Diagnostics and evidence**: doctor, status, logs, command verification, and fixture replay explain what ran, what matched, and why.
- **External tool object tree**: `tools.schema` names callable event, feature, function, system, and help surfaces for CLI, hook, MCP, and future UI adapters.

The runtime itself is deterministic. It executes rule data against official Codex hook schemas, applies `trigger + feature + output` declarations, validates official output, and writes only official hook output. Each event owner handles `permission_mode` using its own official output shape; restricted modes receive full-access guidance, and local rules act as hook guardrails after `permission_mode=bypassPermissions`.

Architecture truth lives in `docs/handbook/index.html`. This README is the public entrypoint.

## Status

- Version: `0.2.0`
- Runtime: CLI and Codex hook interface
- Daemon: roadmap
- Rule runtime: canonical `trigger + feature + output` declarations only
- Stateful features: status-owned hook state
- External surface: `tools.schema` object tree
- Schema tree: `schema/codex-hooks.schema.json` root manifest + `schema2object.Loader.resolve()`
- Supported Node.js: `>=20`

## Why This Exists

Raw hooks are extension points. `codex-hooks` is the operating layer:

```text
Codex event -> official schema -> policy rule -> feature/state -> official output -> log/status evidence
```

The goal is not to replace Codex hooks. The goal is to make hooks usable as repeatable product features: inspectable, typed, stateful, testable, and safe to install.

## How You Use It

Tell Codex what you want:

```text
Install codex-hooks for this project.
Add a rule that blocks rm -rf in Bash.
Block the first rg/find call until the agent understands the project structure.
Disable the sudo rule.
Add a feature that detects another Bash pattern.
Show hook status from the latest log.
Explain why this hook did not run.
```

Codex then follows the handbook:

```text
read handbook -> find owner/schema/gate -> edit artifacts -> verify -> install or report evidence
```

The CLI is the tool surface Codex uses to verify and deploy. Humans can run it directly, but the intended workflow is natural-language requirement first, Codex operation second. Feature development follows the same rule: tell Codex the feature, and Codex follows the handbook to plan, edit, test, and report evidence.

## Developer Install

```bash
git clone https://github.com/woolkingx/codex-hooks.git
cd codex-hooks
npm test
```

For local development without publishing:

```bash
npm link
codex-hooks doctor --rules policy/rules
```

## Operator Smoke

Codex uses commands like these while executing a user request. Run the bundled `PreToolUse` fixture through the default rule pack:

```bash
node src/adapters/cli.mjs run test/fixtures/pre-tool-use-bash-rm.json --rules policy/rules
```

Expected output is an official `PreToolUse` block response:

```json
{
  "decision": "block",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  }
}
```

Check authoring requirements and runtime rules are synchronized:

```bash
node src/adapters/cli.mjs policy requirements sync --file policy/user.json --rules policy/rules
```

Render a Codex hooks config without writing:

```bash
node src/adapters/cli.mjs render-hooks --target project --rules policy/rules --log hooks.jsonl
```

Codex user-level hook configuration is written to `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json`; project-level configuration is written to `<git-root>/.codex/hooks.json`. The generated file has a `hooks` root, official Codex event keys such as `PreToolUse`, matcher groups, and command hooks that call `codex-hooks hook`. Pass `--log hooks.jsonl` during render or install when the generated hooks should write JSONL runtime observations.

Install into a project when the user explicitly asked for installation:

```bash
node src/adapters/cli.mjs install --target project --rules policy/rules --log hooks.jsonl --apply
```

Install into the user Codex config:

```bash
node src/adapters/cli.mjs install --target user --rules policy/rules --log hooks.jsonl --apply
```

## Policy Model

User requirement source:

```json
{
  "version": "0.0.0",
  "requirements": [
    {
      "id": "deny-rm",
      "event": "pre-tool-use",
      "enabled": true,
      "requirement": "Block Codex from running rm under Bash."
    }
  ]
}
```

Runtime rule data lives at:

```text
policy/rules/<event>/<id>.rule.json
```

Rule id equals requirement id. No index is required. Codex keeps the two sides synchronized and reports an error if they drift.

## Codex Work Loop

For rule or feature requests, Codex should:

1. Read `CLAUDE.md` and `docs/handbook/index.html`.
2. Use the owning chapters: `usage.html`, `policy.html`, `event-model.html`, `schema-tree.html`, and `deployment.html`.
3. Find the owner, schema, boundary, and acceptance gate.
4. For rule behavior, add or update one requirement in `policy/user.json` and the matching `policy/rules/<event>/<id>.rule.json`.
5. For feature behavior, update the owning feature module, schema, handler, and tests.
6. Run policy sync, rule explain, hook fixture smoke, focused tests, and full verification when behavior changes.
7. Report changed files, verification evidence, and remaining warnings.

## Safety Model

- Codex hooks are guardrails, not a complete security or enforcement boundary. OpenAI's Codex hooks documentation notes that `PreToolUse` can often be bypassed by equivalent work through another supported tool path, and that some shell and non-shell tool paths are not intercepted yet: https://developers.openai.com/codex/hooks
- Runtime accepts only event-owned rule schemas.
- Runtime validates official input and official output.
- Unsupported rule data fails closed when the event output schema admits a blocking output.
- Compiler reports, gaps, traces, diagnostics, and runtime errors are log information, not extra schema roots.
- Logs support redaction patterns when a log path is configured.

## Verification

```bash
npm run verify
```

This runs handbook checks, stale-runtime checks, user-rule sync, tests, and a live CLI smoke.

## Handbook

Start here for architecture and owner boundaries:

- `docs/handbook/index.html`
- `docs/handbook/model-onboarding.html`
- `docs/handbook/event-model.html`
- `docs/handbook/policy.html`
- `docs/handbook/deployment.html`
- `docs/handbook/acceptance-gates.html`

## License

MIT
