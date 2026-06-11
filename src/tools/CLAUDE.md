# src/tools

Owner: external callable tool object tree.

Schema truth: `schema/tools.schema.json`

## Rules

| rule | action |
|---|---|
| Object first | Tool nodes are `type + status + value + method`. |
| Descriptor only | `value` stores owner refs, schema refs, adapters, examples, and gates; it does not copy event, feature, policy, runtime, or deploy truth. |
| Adapter projection | CLI, hook, MCP, web, and help renderers read this owner; they do not own tool truth. |
| Schema boundary throws | Validate catalog data through `schema/tools.schema.json`; do not silently ignore invalid nodes. |

## Navigation

| path | purpose |
|---|---|
| `schema/tools.schema.json` | Machine contract for the external callable object tree. |
| `src/tools/catalog.mjs` | First schema-valid object tree value. |
| `src/tools/index.mjs` | Object-local methods: `validate`, `list`, `describe`, `renderHelp`. |
| `test/tools.test.mjs` | Owner proof and CLI/help projection proof. |
