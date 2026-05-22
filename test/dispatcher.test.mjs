import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { kebabFromWire, listEvents, loadHandler } from '../src/core/handlers.mjs'

test('handlers registry covers every official Codex event', () => {
  const generatedDir = path.resolve('schema/api/openai-codex/generated')
  const officialKebab = fs.readdirSync(generatedDir)
    .filter(f => f.endsWith('.command.input.schema.json'))
    .map(f => f.replace('.command.input.schema.json', ''))
    .sort()
  const registered = listEvents().sort()
  assert.deepEqual(registered, officialKebab)
})

test('loadHandler accepts PascalCase wire names', async () => {
  const entry = await loadHandler('PreToolUse')
  assert.ok(entry)
  assert.equal(entry.meta.event, 'pre-tool-use')
})

test('loadHandler accepts kebab-case names', async () => {
  for (const name of listEvents()) {
    const entry = await loadHandler(name)
    assert.ok(entry, `missing handler: ${name}`)
    assert.equal(entry.meta.event, name)
  }
})

test('loadHandler returns null for unknown', async () => {
  assert.equal(await loadHandler('NotAnEvent'), null)
})

test('kebabFromWire maps wire names', () => {
  assert.equal(kebabFromWire('PreToolUse'), 'pre-tool-use')
  assert.equal(kebabFromWire('SubagentStart'), 'subagent-start')
})

test('every handler exposes meta with event + actions', async () => {
  for (const name of listEvents()) {
    const entry = await loadHandler(name)
    assert.equal(entry.meta.event, name)
    assert.ok([...entry.meta.actions].length >= 1)
  }
})
