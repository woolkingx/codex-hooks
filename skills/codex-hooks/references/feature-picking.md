# Feature Picking Heuristics

Features are module-owned capabilities admitted by an event rule schema. Each feature has its own `schema.json` and handler under `src/features/<feature>/`.

## Current Features

| feature | value owner | typical use |
|----|----|----|
| `bash-command` | `src/features/bash-command/schema.json` | Match Bash command name, args, flags, and file-write behavior from an official command input path. |

## Picking Order

1. Exact input field equality -> put it in `trigger`.
2. Bash command name / arg / flag / write semantics -> use `feature["bash-command"]`.
3. Missing deterministic capability -> write compiler log information, then add a feature module before compiling the rule.

## Compile Gap Signal

Write compiler log information when:
- The predicate requires data the official input schema does not provide.
- The event rule schema does not admit the needed feature.
- No module-owned feature schema can express the needed value.
- The output shape cannot be expressed as official output data.
