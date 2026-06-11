# Changelog

## 0.2.0 - 2026-06-11

- Refreshed the OpenAI Codex generated hook schema mirror metadata to commit `7c2394808ed09b1e3aae254f12c027ff657e8f20`.
- Added status-owned hook-state data for bounded, project-scoped hook control state.
- Added the `block-first-time` feature and bundled first-use structural-search gates for `rg` and `find`, scoped by `cwd + session_id + compact_mark + feature key`.
- Added `schema/tools.schema.json` as the external callable object tree for event, feature, fn, system, and help objects.
- Added CLI `tools list`, `tools describe`, and `tools help` projections over the tools owner, with adapter status for CLI, hook, MCP, and web surfaces.
- Fixed `PermissionRequest` projection of stateful `pre-tool-use` rules so stateless callers skip `block-first-time` instead of crashing, while state-backed callers commit first-time status.

## 0.1.28 - 2026-05-30

- Refreshed the OpenAI Codex generated hook schema mirror to commit `3e7baa00e43419967d90d6ad9cef40f58d5ac89f`.
- Added official subagent tool-call identity support for `PreToolUse` and `PostToolUse` payloads.
- Added the official `SubagentStop` event owner, rule schema, dispatcher entry, deploy config admission, and tests.
- Documented the schema mirror stale-check path and the handler/root-schema/user-policy sync requirements for future schema refreshes.

## 0.1.27 - 2026-05-22

- Documented the official semantics and permission-mode policy for all nine Codex hook events.
- Added event-owned permission mode gates for every event whose official input schema contains `permission_mode`.
- Updated full-surface fixtures to use `permission_mode=bypassPermissions`.

## 0.1.26 - 2026-05-22

- Changed `PermissionRequest` into a full-access mode gate: non-`bypassPermissions` requests return official deny output with restart guidance.
- Kept compatible `pre-tool-use` rule projection only after the full-access mode gate passes.

## 0.1.25 - 2026-05-22

- Added deploy-time `--log` propagation so rendered and installed Codex hook commands can write JSONL runtime observations.
- Logged fail-closed executor error PDU data from CLI hook/run executions.
- Routed `PermissionRequest` through compatible `pre-tool-use` rule data and mapped allow/deny results back to official PermissionRequest output.

## 0.1.24 - 2026-05-22

- Added `docs/handbook/model-onboarding.html` as the fast path for Codex to route natural-language requests to owners, schemas, files, and verification.
- Linked the model onboarding chapter from the global handbook navigation and public README.

## 0.1.23 - 2026-05-22

- Added `docs/handbook/usage.html` with CLI install, policy sync, rule smoke test, hook render/install, and log/status examples.
- Linked the Usage chapter from the handbook reading order and chapter map.

## 0.1.22 - 2026-05-22

- Removed the remaining core schema bypass helpers after the root schema tree switch.
- Added deploy executable coverage for rendered hooks, doctor gates, and dry-run install data.
- Expanded root schema traversal tests for system schemas and clarified feature schemas as referenced modules, not event tuple members.

## 0.1.21 - 2026-05-22

- Added root schema graph manifest at `schema/codex-hooks.schema.json`.
- Routed runtime schema access through `schema2object.Loader.resolve()`.
- Ref-linked event rule features and outputs to module-owned and official schemas.

## 0.1.20 - 2026-05-22

- Replaced canonical runtime rule shape with `trigger + feature + output`.
- Added module-owned `bash-command` feature schema and handler.
- Migrated bundled rules away from `fields[]`, `conditions[]`, `process`, `params`, and `write`.

## 0.1.19 - 2026-05-22

- Added policy sync to deploy doctor.
- Updated handbook, boot cards, and compiler skill for user-owned requirement `enabled`.
- Made Bash command rules guard on `$.tool_name == "Bash"` and made field conditions short-circuit.
- Made Bash command field processors return no-match on parser failure instead of failing the hook.
- Kept hook runtime independent from authoring requirements while deploy gates enforce coherence.

## 0.1.18 - 2026-05-22

- Added user-owned `enabled` state to `policy/user.json` requirements.
- Enforced normalized `enabled` equality between requirements and runtime rules.
- Documented rule `enabled` as compiled projection with default `true`.
