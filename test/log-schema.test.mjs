import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildLogRecord, appendLog, readLogTail } from '../src/log/index.mjs'

const REQUIRED_FIELDS = [
  'trace_id', 'event_id', 'event_name', 'fired_rule_id',
  'duration_ms', 'created_at', 'input', 'output', 'error',
]

const BANNED_FIELDS = [
  'decision_id', 'decision_action', 'matched_rule_ids',
  'enforced_rule_ids', 'test_rule_ids', 'output_bytes',
  'policy_version', 'handle',
]

test('buildLogRecord — has all required fields', () => {
  const record = buildLogRecord({ hook_event_name: 'pre-tool-use' }, 'pre-tool-use', 'id-1', null, null, {})
  for (const field of REQUIRED_FIELDS) {
    assert.ok(Object.hasOwn(record, field), `missing field: ${field}`)
  }
})

test('buildLogRecord — no banned (decision pipeline) fields', () => {
  const record = buildLogRecord({ hook_event_name: 'pre-tool-use' }, 'pre-tool-use', 'id-1', null, null, {})
  for (const field of BANNED_FIELDS) {
    assert.ok(!Object.hasOwn(record, field), `banned field present: ${field}`)
  }
})

test('buildLogRecord — fired_rule_id null when no rule fired', () => {
  const record = buildLogRecord({}, 'pre-tool-use', '', null, null, {})
  assert.equal(record.fired_rule_id, null)
})

test('buildLogRecord — fired_rule_id set when rule fired', () => {
  const record = buildLogRecord({}, 'pre-tool-use', 'id-1', 'rule-abc', { continue: true }, {})
  assert.equal(record.fired_rule_id, 'rule-abc')
})

test('buildLogRecord — error null when no error', () => {
  const record = buildLogRecord({}, 'pre-tool-use', '', null, null, {})
  assert.equal(record.error, null)
})

test('buildLogRecord — error PDU shape when error provided', () => {
  const err = new Error('something failed')
  const record = buildLogRecord({}, 'pre-tool-use', '', null, null, { error: err, errorLayer: 'executor' })
  assert.ok(record.error !== null)
  assert.equal(record.error.layer, 'executor')
  assert.equal(typeof record.error.code, 'string')
  assert.equal(typeof record.error.message, 'string')
})

test('buildLogRecord — input is redacted', () => {
  const input = { hook_event_name: 'pre-tool-use', api_key: 'sk-secret123' }
  const record = buildLogRecord(input, 'pre-tool-use', '', null, null, {})
  assert.equal(record.input.api_key, '[REDACTED]')
})

test('appendLog — throws on invalid log record (missing required fields)', () => {
  const logPath = path.join(os.tmpdir(), `test-log-${Date.now()}.jsonl`)
  const badRecord = { trace_id: 'x', event_name: 'pre-tool-use' } // missing many required fields
  assert.throws(() => appendLog(badRecord, { logPath }), TypeError)
})

test('appendLog — valid record writes successfully', () => {
  const logPath = path.join(os.tmpdir(), `test-log-${Date.now()}.jsonl`)
  const record = buildLogRecord({}, 'pre-tool-use', 'id-1', null, null, {})
  assert.doesNotThrow(() => appendLog(record, { logPath }))
})

test('cli run — fail-closed executor error is written to JSONL log', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-log-'))
  const inputPath = path.join(tmp, 'bad-pre-tool-use.json')
  const logPath = path.join(tmp, 'hooks.jsonl')
  fs.writeFileSync(inputPath, JSON.stringify({ hook_event_name: 'PreToolUse' }))

  const result = spawnSync(process.execPath, [
    'src/adapters/cli.mjs',
    'run',
    inputPath,
    '--rules',
    'policy/rules',
    '--log',
    logPath,
  ], { cwd: process.cwd(), encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const [entry] = readLogTail({ logPath, tail: 1 })
  assert.equal(entry.event_name, 'pre-tool-use')
  assert.ok(entry.error)
  assert.equal(entry.error.layer, 'executor')
})
