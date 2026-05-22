# Contributing

`codex-hooks` is handbook-first and schema-first.

## Development Flow

1. Read `CLAUDE.md`.
2. Read the relevant chapter under `docs/handbook/`.
3. Update handbook or schema before changing runtime behavior.
4. Keep implementation in ESM `.mjs`.
5. Run `npm run verify`.

## Boundaries

- Do not add schema roots for intermediate computation.
- Do not add alternate rule runtimes.
- Do not emit hook output fields absent from the official Codex output schema.
- Keep `README.md` as public navigation; architecture truth belongs in `docs/handbook/`.

## Pull Requests

Pull requests should include:

- The owner boundary changed.
- The schema or handbook chapter changed.
- The verification command output.
- Any remaining risk.
