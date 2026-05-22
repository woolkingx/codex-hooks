# deploy

Architecture truth: `../../docs/handbook/deployment.html`

## Rules

| rule | action |
|---|---|
| Owner data | Deployment records validate against `schema.json`. |
| No hidden writes | V1 deploy services render configs, run doctor checks, and return dry-run install plans only. |
| Adapter boundary | CLI may call deploy services but must not own environment or install logic. |
| Runtime boundary | Deploy does not evaluate policy decisions and does not write hook stdout. |

## Navigation

| path | purpose |
|---|---|
| `schema.json` | Local pointer to the deploy root schema. |
| `test.html` | Proof contract for deploy services. |
| `render-hooks.mjs` | Pure official Codex hooks config renderer. |
| `doctor.mjs` | Read-only environment and coverage checks. |
| `install.mjs` | Dry-run install plan builder. |
