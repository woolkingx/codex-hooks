import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './user-prompt-submit.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"UserPromptSubmit","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","prompt":"hello","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'const-rule',
    event: 'user-prompt-submit',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})

test('default permission mode blocks before rule evaluation', async () => {
  const input = {"hook_event_name":"UserPromptSubmit","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"default","prompt":"hello","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const result = await handle(input, [])
  assert.equal(result.fired_rule_id, null)
  assert.equal(result.output.decision, 'block')
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(result.output.reason, /bypassPermissions/)
})
