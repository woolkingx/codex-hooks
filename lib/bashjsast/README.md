# bashjsast

You build tools that act on shell commands — linters, security scanners, hook systems, formatters, CI gates. You need to know what a command does: which programs it calls, what files it writes, what flags it passes. String splitting breaks on the first pipe. Regex breaks on the first heredoc.

bashjsast parses any bash source into a plain-object AST in pure JavaScript. No WASM, no native binaries, no dependencies.

```js
import { query } from 'bashjsast'

const q = query('TZ=UTC curl -sL https://api.example.com | jq .data > out.json 2>&1')
q.commands()    // ['curl', 'jq']
q.flags()       // ['-sL']
q.writes()      // ['out.json']
q.assignments() // [{ name: 'TZ', value: 'UTC', append: false }]
q.pipeNames()   // [['curl', 'jq']]
q.analyze()     // all of the above in one call
```

One function call. Every fact about the command, structured and ready to use.

## What you get

**A correct AST.** 34 JSON Schema (Draft-07) definitions enforce every node at construction. An invalid AST node cannot exist — the parser throws before it returns. No "trust me" documentation; the schema is the contract.

**Answers, not trees.** The `query()` API extracts commands, flags, arguments, redirects, assignments, pipe chains, subcommands, and function definitions. You write `q.writes()`, not a recursive visitor.

**Round-trip fidelity.** `print(parse(src))` produces canonical bash text. Parse it again and the AST is identical. Your tool can read, transform, and rewrite bash safely.

**No runtime tax.** Two core files, 1,305 lines, zero dependencies. Parses in ~0.05ms. Runs in Node, Bun, Deno, and browsers. No WASM loader, no `.node` binaries, no postinstall scripts.

## Install

```bash
npm install bashjsast
```

## Quick start

```js
import { parse, print, query } from 'bashjsast'

// Parse — returns a plain dict AST (JSON-serializable)
const ast = parse('for f in *.txt; do wc -l "$f"; done')

// Print — canonical bash text, round-trip safe
print(ast)  // 'for f in *.txt; do wc -l "$f"; done'

// Query — structured extraction, no traversal
const q = query('git commit -m "fix" && git push origin main')
q.commands()  // ['git', 'git']
q.flags()     // ['-m']
q.args()      // ['fix', 'origin', 'main']
```

## Syntax coverage

All bash syntax parses correctly:

- Commands, pipelines (`|`, `|&`), lists (`&&`, `||`, `;`, `&`)
- Compound commands: `if`/`elif`/`else`, `while`, `until`, `for` (word and arithmetic), `case` (`;;`/`;&`/`;;&`), `select`
- Groups `{ }`, subshells `( )`, functions (keyword and POSIX)
- Arithmetic `(( ))`, conditional `[[ ]]`, coproc
- All redirects: `>` `>>` `<` `<<` `<<<` `>|` `>&` `<&` `&>` `&>>` `<>`
- Heredocs (`<<`, `<<-`) and here-strings (`<<<`)
- Process substitution `<()` `>()`
- Quoting: single, double, `$''`, `$""`
- Command substitution `$()` and `` ` ` ``
- Assignments, `+=`, array assignments `=()`
- Line continuation `\`

## API

### `parse(source) → AST`

Returns a plain-object AST. Node types:

| Node | Fields |
|------|--------|
| `Script` | `commands[]` |
| `SimpleCommand` | `name`, `args[]`, `assignments[]`, `redirects[]` |
| `Pipeline` | `commands[]`, `negated` |
| `List` | `op`, `left`, `right` |
| `If` | `test`, `body`, `alternate` |
| `While` / `Until` | `test`, `body` |
| `For` | `name`, `items[]`, `body` |
| `Case` | `word`, `clauses[]` |
| `Select` | `name`, `items[]`, `body` |
| `Group` / `Subshell` | `body` |
| `Function` | `name`, `body`, `hasKeyword` |
| `Arithmetic` | `expression` |
| `Condition` | `condType`, `op`, `left`, `right` |
| `Coproc` | `name`, `body` |

### `print(ast) → string`

Canonical bash text. Round-trip idempotent: `print(parse(print(parse(src)))) === print(parse(src))`.

### `query(source) → BashQuery`

Structured extraction:

| Method | Returns |
|--------|---------|
| `.commands()` | command names |
| `.flags()` | flags (`-v`, `--verbose`) |
| `.args()` | non-flag arguments |
| `.writes()` / `.reads()` | redirect targets |
| `.assignments()` | variable assignments |
| `.pipes()` / `.pipeNames()` | pipe chains |
| `.functions()` | function definitions |
| `.subcommands()` | `$()` and `` ` ` `` bodies |
| `.command(name)` | detail for one command |
| `.analyze()` | everything above in one call |

### `Lexer` / `T`

Direct tokenizer access:

```js
import { Lexer, T } from 'bashjsast'
const tokens = new Lexer('echo hello').tokenize()
```

### Compatibility layer

Drop-in replacement for `unbash`:

```js
import { parse } from 'bashjsast/compat'
```

## Architecture

```
src/
  lexer.mjs    — tokenizer, context-dependent reserved words (455 lines)
  parser.mjs   — recursive descent, plain dict AST (864 lines)
  printer.mjs  — AST → canonical text, ported from bash print_cmd.c
  query.mjs    — structured extraction layer
  compat.mjs   — unbash-compatible output format
  index.mjs    — public exports
schema/        — 34 JSON Schema Draft-07 definitions (AST node contracts)
test/          — 129+ tests (node:test)
```

## Tests

129+ tests covering all node types, edge cases, and round-trip fidelity. Passes every valid test case from bashlex's test suite (72/72).

```bash
node --test test/phase1.mjs
```

## License

MIT
