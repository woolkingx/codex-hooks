import test from 'node:test'
import assert from 'node:assert/strict'
import { runHook } from '../src/core/run.mjs'
import { ensureValid, loadOfficialSchema } from '../src/core/load.mjs'

test('failClosed=true returns official pre-tool-use blocking output on SDU error', async () => {
  const result = await runHook(
    { hook_event_name: 'PreToolUse' },
    { failClosed: true, rulesRoot: 'policy/rules' },
  )
  assert.ok(result.error, 'error PDU populated')
  assert.ok(result.output, 'fail-closed must not return null output')
  ensureValid(result.output, loadOfficialSchema('pre-tool-use', 'output'), 'pre-tool-use.error-output')
  assert.equal(result.output.decision, 'block')
})

test('failClosed=true returns official permission-request deny on SDU error', async () => {
  const result = await runHook(
    { hook_event_name: 'PermissionRequest' },
    { failClosed: true, rulesRoot: 'policy/rules' },
  )
  assert.ok(result.error)
  assert.ok(result.output)
  ensureValid(result.output, loadOfficialSchema('permission-request', 'output'), 'permission-request.error-output')
})

test('failClosed=false rethrows on invalid SDU', async () => {
  await assert.rejects(
    () => runHook({ hook_event_name: 'PreToolUse' }, { failClosed: false, rulesRoot: 'policy/rules' }),
  )
})

test('unknown event_name with failClosed=true returns null output + error PDU (no invented official shape)', async () => {
  const result = await runHook(
    { hook_event_name: 'NotARealEvent' },
    { failClosed: true, rulesRoot: 'policy/rules' },
  )
  assert.ok(result.error, 'error PDU populated')
  assert.equal(result.output, null, 'unknown event has no official owner; output stays null')
})
