# events.post-compact

## Scope
post-compact channel: layer executor (input schema -> rule schema -> output schema).

## Handbook
Architecture truth: `../../../docs/handbook/event-model.html`

## Keypoints
- event owns its official input schema, event rule schema, official output schema, executor, and tests.
- runtime accepts only `trigger + feature + output` rule data.
- feature declarations are admitted by this event's `post-compact.rule.schema.json`; feature value schemas stay with feature modules; no event metadata data root exists.
- hook stdout must validate against the official output schema.
- errors throw at schema boundaries; fail-closed output is produced only through official output branches.

## Rules / Commands
- `@rules/rules.md`
- Tests: `node --test src/events/post-compact/test.mjs`

## Decisions
- 0.1.20 (2026-05-22): event accepts only `trigger + feature + output` rule data.
- 0.1.13 (2026-05-21): data ontology reset demoted event meta from canonical data roots.
