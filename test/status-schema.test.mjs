import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLogRecord } from '../src/log/index.mjs'
import { buildStatus } from '../src/status/index.mjs'
import { ensureSchemaValid, schemaRefs } from '../src/core/schema-tree.mjs'

test('buildStatus — output passes status.schema validation', () => {
  const entry = buildLogRecord({}, 'pre-tool-use', 'id-1', null, null, {})
  const status = buildStatus([entry], { runId: 'test-run', logPath: '/tmp/test.jsonl' })
  assert.doesNotThrow(() => ensureSchemaValid(status, schemaRefs.system('status'), 'status'))
})

test('buildStatus — empty entries produces valid status', () => {
  const status = buildStatus([], { runId: 'empty', logPath: null })
  assert.doesNotThrow(() => ensureSchemaValid(status, schemaRefs.system('status'), 'status'))
  assert.equal(status.total_runs, 0)
  assert.equal(status.health, 'ok')
  assert.equal(status.last_event, null)
})

test('buildStatus — error_runs increments for entries with error', () => {
  const goodEntry = buildLogRecord({}, 'pre-tool-use', 'id-1', null, null, {})
  const errorEntry = buildLogRecord({}, 'pre-tool-use', 'id-2', null, null, { error: new Error('boom') })
  const status = buildStatus([goodEntry, errorEntry], {})
  assert.equal(status.error_runs, 1)
  assert.equal(status.health, 'error')
})
