# codex-hooks.features.bash-command

## Scope

Owns the `bash-command` feature value schema and handler.

## Rules

- `schema.json` owns persisted `rule.feature["bash-command"]` value shape.
- `bash-command.mjs` may use `lib/bashjsast` privately.
- Parser output is not rule data, event input data, or schema data.
- Parser failure returns no-match, not a hook runtime failure.

