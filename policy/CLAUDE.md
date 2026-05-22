# codex-hooks.policy

## Scope

`policy/` 目錄：user requirement data、executable rule data、composition profiles。Compiler gap/report/trace/explain/diagnostic 歸 log。

## Handbook

架構真相：../docs/handbook/policy.html

## Keypoints

- `user.json` = user requirement source-of-truth：`requirements[] = { id, event, enabled, requirement }`；`enabled` 預設 `true` 並投影到 rule `enabled`；runtime 不讀；owner 是 `src/policy/user.mjs`。
- `rules/<event>/*.rule.json` = executable rule data；runtime 讀。一檔一 rule。
- `profiles/*.profile.json` = composition profile（runtime 選擇 + overlay）。
- owner boundary：requirement → compiler → rule data；compile gap/report/trace/explain/diagnostic → log data。
- 不在 user.json 寫 rule trigger / feature config / runtime config / diagnostic / trace。

## Rules / Commands

- `@rules/rules.md`
- 驗證 user.json：`node src/adapters/cli.mjs policy requirements validate`
- 列 requirements：`node src/adapters/cli.mjs policy requirements list`
- 雙向檢查 user requirement ↔ rule file：`node src/adapters/cli.mjs policy requirements sync`

## Decisions

- 0.1.4 (2026-05-21): user.json requirement shape introduced. Data ontology reset later demotes gap and compiler diagnostics to log information.
