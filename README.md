# codex-hooks

Codex-operated hook policy runtime for local safety guardrails and plugin-like capabilities.

`codex-hooks` is meant to solve Codex permission-management hell without sending users back into sandbox tuning, manual allowlists, or one-off shell wrappers. It also replaces temporary development scripts with a schema-owned foundation for hook behavior, test boundaries, and feature growth. Humans state safety, workflow, or plugin-like feature requirements in natural language; Codex follows the handbook to develop those requirements into the hooks system: update `policy/user.json`, maintain matching rule files, change feature modules, verify behavior, and install Codex hooks.

The runtime itself is deterministic. It executes rule data against official Codex hook schemas, validates official input, applies `trigger + feature + output` rule data, validates official output, and writes only official hook output. Each event owner handles `permission_mode` using its own official output shape; restricted modes receive full-access guidance, and local rules act as hook guardrails after `permission_mode=bypassPermissions`.

Architecture truth lives in `docs/handbook/index.html`. This README is the public entrypoint.

## Status

- Version: `0.2.0`
- Runtime: CLI and Codex hook interface
- Daemon: roadmap
- Rule runtime: canonical `trigger + feature + output` declarations only
- Schema tree: `schema/codex-hooks.schema.json` root manifest + `schema2object.Loader.resolve()`
- Supported Node.js: `>=20`

## How You Use It

Tell Codex what you want:

```text
Install codex-hooks for this project.
Add a rule that blocks rm -rf in Bash.
Disable the sudo rule.
Add a feature that detects another Bash pattern.
Show hook status from the latest log.
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
