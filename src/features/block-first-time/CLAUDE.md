# codex-hooks.features.block-first-time

## Scope

Owns the `block-first-time` feature value schema and handler.

## Rules

- `schema.json` owns persisted `rule.feature["block-first-time"]` value shape.
- The feature reads first-time status from the status-owned hook-state ledger.
- If no hook-state owner is available in context, the feature does not match. It must not throw, create implicit state, or treat every stateless call as first-time.
- The feature must not write during evaluation; writes happen only through the deferred commit after a rule output validates.
- Scope is `cwd + session_id + compact_mark + key`; `PostCompact` advances `compact_mark`.
