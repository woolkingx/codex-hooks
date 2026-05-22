---
name: codex-hooks-compiler
description: Use when compiling policy/user.json requirements into codex-hooks trigger + feature + output rule data or compiler log records. Invoke whenever a requirement needs a rule file, an existing requirement changes, or the user asks how plain-language hook behavior becomes executable rule data.
---

# codex-hooks compiler

Compile user requirements into trigger + feature + output rule data the codex-hooks runtime can execute deterministically. If the compiler cannot express a requirement, write compiler feedback as log information and exit non-zero; do not create a separate gap artifact.

## When to Use

- A new requirement has been added to `policy/user.json` and needs a rule.
- An existing requirement changed and the corresponding rule file must be regenerated.
- A prior compiler log says the current event rule schema or feature set cannot express a requirement, and a feature module may now cover it.

Do not use for: runtime hot path, rule schema design changes, feature implementation.

## Inputs

- `policy/user.json` requirement data: `requirements[] = { id, event, enabled, requirement }`.
- Official Codex input schema: `schema/api/openai-codex/generated/<event>.command.input.schema.json`.
- Official Codex output schema: `schema/api/openai-codex/generated/<event>.command.output.schema.json`.
- Event rule schema: `src/events/<event>/<event>.rule.schema.json`.
- Feature schemas: `src/features/<feature>/schema.json`.

## Steps

1. Read one requirement: stable `id`, `event`, user-owned `enabled`, and plain `requirement` text.
2. Read the event input schema, event rule schema, output schema, and needed feature schemas.
3. Draft rule data for `policy/rules/<event>/<id>.rule.json`.
4. Rule data uses only:
   - `trigger`: flat official input paths to literal expected values.
   - `feature`: module-owned feature data, keyed by feature name and validated by that feature schema.
   - `output`: official event output data.
5. Run examples against `applyRule` when examples exist.
6. If the requirement cannot be expressed, write a compiler log record such as `compile.gap`, `compile.trace`, or `compile.diagnostic` and exit non-zero.

## Outputs

- Success: `policy/rules/<event>/<requirement-id>.rule.json`.
- Failure: log information only; no persistent separate gap file or extra schema root.

Hard rules:
- Runtime never reads `policy/user.json`.
- Rule id equals requirement id and rule filename.
- Rule `enabled` equals requirement `enabled`; missing values normalize to `true`.
- Rule trigger paths validate against the event input schema.
- Rule feature entries validate against module-owned feature schemas.
- Rule output validates against the official output schema.
- Never write `fields[]`, `conditions[]`, `process`, `params`, or `write` into runtime rule data.
- Never silent-catch errors or invent output fields.

## References

- references/rule-fixture.md — trigger + feature + output rule fixture
- references/gap-fixture.md — compiler log fixture for an uncompiled requirement
- references/feature-picking.md — feature picking heuristics
