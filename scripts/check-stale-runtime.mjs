#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'CLAUDE.md',
  'docs/handbook',
  'skills',
  'src',
  'test',
  'policy',
  'schema',
  'package.json',
]

const patterns = [
  /\$op/,
  /\$input/,
  /\$const/,
  /evalLogic/,
  /loadOperators/,
  /rule\.logic/,
  /logic_summary/,
  /src\/rules\/operators/,
  /operator-picking/,
  /operator config/i,
  /operator schema/i,
  new RegExp('field-processing\\s+migration', 'i'),
  /legacy expression/i,
  /expression-tree/i,
]

const schemaTreeRuntimePatterns = [
  /new Loader\(/,
  /readJson\(`src\/events\/\$\{event\}/,
  /readJson\('src\/events\/' \+ .* \+ '\/'/,
  /readJson\(`schema\/api\/openai-codex\/generated/,
  /readJson\('schema\/api\/openai-codex\/generated/,
  /readJson\(['"]schema\/[^'"]+\.schema\.json/,
  /readFileSync\(.*schema\.json/,
  /const schema = \{ type: 'object', properties:/,
]

const failures = []
for (const file of files(roots)) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (patterns.some(pattern => pattern.test(line))) failures.push(`${file}:${index + 1}: ${line}`)
    if (!schemaTreePatternAllowed(file) && schemaTreeRuntimePatterns.some(pattern => pattern.test(line))) {
      failures.push(`${file}:${index + 1}: schema tree bypass: ${line}`)
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, checked_roots: roots }, null, 2))

function files(entries) {
  return entries.flatMap(entry => {
    if (!fs.existsSync(entry)) return []
    const stat = fs.statSync(entry)
    if (stat.isFile()) return [entry]
    return walk(entry)
  }).filter(file => !file.includes(`${path.sep}.git${path.sep}`))
}

function schemaTreePatternAllowed(file) {
  return file === 'src/core/schema-tree.mjs' ||
    file.startsWith(`lib${path.sep}schema2object${path.sep}`) ||
    file.startsWith(`scripts${path.sep}`) ||
    file.startsWith(`test${path.sep}`)
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.isFile()) return []
    if (/\.(mjs|js|json|md|html|yml|yaml)$/.test(entry.name)) return [full]
    return []
  })
}
