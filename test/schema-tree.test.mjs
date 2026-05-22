import test from 'node:test'
import assert from 'node:assert/strict'
import { bindObject, ensureSchemaValid, readJson, resolveSchema, schemaRefs } from '../src/core/schema-tree.mjs'

test('root schema resolves event input, rule, output, feature, and system schemas', () => {
  for (const ref of [
    schemaRefs.eventInput('pre-tool-use'),
    schemaRefs.eventRule('pre-tool-use'),
    schemaRefs.eventOutput('pre-tool-use'),
    schemaRefs.feature('bash-command'),
    schemaRefs.system('config'),
    schemaRefs.system('deploy'),
    schemaRefs.system('log'),
    schemaRefs.system('profile'),
    schemaRefs.system('status'),
    schemaRefs.userPolicy(),
  ]) {
    const { node, loader } = resolveSchema(ref)
    assert.equal(typeof node, 'object')
    assert.ok(loader)
  }
})

test('rule data binds through ObjectTree with resolved sub-loader scope', () => {
  const rule = readJson('policy/rules/pre-tool-use/deny-rm.rule.json')
  const tree = bindObject(rule, schemaRefs.eventRule('pre-tool-use'), 'deny-rm')
  assert.equal(tree.id, 'deny-rm')
  assert.equal(tree.feature['bash-command'].value.name, 'rm')
})

test('log root data validates through root schema tree', () => {
  const log = {
    entries: [],
    retention_days: 7,
    redaction: { patterns: [] },
  }
  assert.doesNotThrow(() => ensureSchemaValid(log, schemaRefs.system('log'), 'log'))
})
