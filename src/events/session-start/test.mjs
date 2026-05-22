import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './session-start.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"SessionStart","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","source":"startup","transcript_path":"/tmp/t.txt"}
  const rules = [{
    id: 'const-rule',
    event: 'session-start',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})

test('default permission mode stops before rule evaluation', async () => {
  const input = {"hook_event_name":"SessionStart","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"default","source":"startup","transcript_path":"/tmp/t.txt"}
  const result = await handle(input, [])
  assert.equal(result.fired_rule_id, null)
  assert.equal(result.output.continue, false)
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(result.output.stopReason, /bypassPermissions/)
})
