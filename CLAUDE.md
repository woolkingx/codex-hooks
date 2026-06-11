# codex-hooks

Scope: Schema-first operating layer for Codex hooks: policy, state, diagnostics, and verified guardrails.

Architecture truth: `docs/handbook/index.html`

## Rules

| rule | action |
|---|---|
| Handbook first | Architecture and product contracts belong in `docs/handbook/`. |
| Schema first | All data starts from Draft-07 JSON Schema; each schema has one owner. |
| Data ontology | Schema follows data: event input, event rule, event output, plus system log/status/config/deploy/profile/tools and authoring user requirements. No schema root without data ontology. |
| Schema boundary throws | `ensureValid` and equivalents throw on contract violation; never silently catch or noop. |
| Runtime observations | Errors, compiler gaps, reports, traces, explanations, and diagnostics are log information unless an official event output schema admits them. |
| V1 runtime | V1 has `hook` and `cli` interfaces only; no daemon process. |
| Daemon-ready | Do not design global mutable assumptions that block a future daemon adapter. |
| ESM only | Implementation files use `.mjs`; no CommonJS. |
| Publish topology | GitHub, Codeberg, and GitLab are peer remotes. Push explicit `release:release` to each intended remote from the `release` worktree; GitLab is an internal git/CI tool by default, not the owner of GitHub/Codeberg publication. |

## Navigation

| path | purpose |
|---|---|
| `docs/handbook/index.html` | Handbook index, reading order, chapter navigation. |
| `docs/handbook/*.html` | Architecture and operator chapters (artifact-roles, topology, schema-tree, event-model, policy, usage, model-onboarding, decision-flow, stage-actions, handbook-skills, runtime-kernels, config, deployment, interfaces, roadmap, acceptance-gates). |
| `schema/codex-hooks.schema.json` | Root schema graph manifest; owns reachability only and connects active schemas by `$ref`. |
| `schema/api/openai-codex/generated/` | Official OpenAI Codex hook schema mirror (SDU + next-PDU pairs). |
| `schema/` | Official schema mirror plus system data schemas: log, status, config, deploy, profile, tools, user-policy. Event rule schemas live with event owners. |
| `policy/user.json` | User requirement source `requirements[] = { id, event, enabled, requirement }`; owner `src/policy/user.mjs`; `enabled` defaults to `true` and projects to rule `enabled`; runtime does not read. |
| `policy/rules/<event>/` | Executable rule data; one rule per file; validates against the owning event rule schema. |
| `policy/profiles/` | Composition profiles with overlay. |
| `src/events/<event>/` | Channel layer executor + `<event>.rule.schema.json` + `CLAUDE.md` + `test.mjs`; event module exports runtime surface. |
| `src/events/_shared/` | Cross-channel helper (`instance-id.mjs`). |
| `src/core/` | OSI core: `schema-tree.mjs` (root Loader boundary), `transition.mjs` (trigger + feature runtime), `run.mjs` (executor entry), `load.mjs` (runtime loaders), `handlers.mjs` (channel dispatch), `errors.mjs` (runtime error information). |
| `src/adapters/cli.mjs` | Transport adapter. |
| `src/deploy/`, `src/log/`, `src/status/` | Control plane and observability. |
| `skills/codex-hooks/` | Compiler skill: turns requirements into rule data and writes compiler observations as log information. |
| `lib/` | Vendored kernels (`schema2object`, `bashjsast`); `bashjsast` is feature-handler private. |

## Decisions

- 0.2.0 (2026-06-11): added status-owned hook-state, `block-first-time` structural-search gates, `tools.schema` external callable object tree, CLI tools projections, and PermissionRequest stateful projection handling.
- 0.1.28 (2026-05-30): official Codex schema mirror refreshed to `3e7baa0`; PreToolUse/PostToolUse accept subagent tool identity, and SubagentStop is now a full event owner.
- 0.1.27 (2026-05-22): api-schema now records official semantics for all nine Codex events, and each permission_mode-bearing event owner has its own full-access gate.
- 0.1.26 (2026-05-22): PermissionRequest is now a full-access mode gate; non-bypassPermissions requests deny with restart guidance, then rules run only after the gate passes.
- 0.1.25 (2026-05-22): deploy hooks can inject JSONL logging, fail-closed CLI errors are logged, and PermissionRequest projects through compatible pre-tool-use rules before emitting official PermissionRequest output.
