import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './subagent-stop.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"SubagentStop","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","agent_id":"agent1","agent_type":"subagent","agent_transcript_path":"/tmp/agent.txt","last_assistant_message":null,"stop_hook_active":false,"transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'const-rule',
    event: 'subagent-stop',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})

test('default permission mode blocks before rule evaluation', async () => {
  const input = {"hook_event_name":"SubagentStop","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"default","agent_id":"agent1","agent_type":"subagent","agent_transcript_path":"/tmp/agent.txt","last_assistant_message":null,"stop_hook_active":false,"transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const result = await handle(input, [])
  assert.equal(result.fired_rule_id, null)
  assert.equal(result.output.decision, 'block')
  assert.match(result.output.reason, /bypassPermissions/)
})
