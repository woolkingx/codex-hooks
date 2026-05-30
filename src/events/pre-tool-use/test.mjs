import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './pre-tool-use.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"PreToolUse","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"ls"},"tool_use_id":"tid1","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'const-rule',
    event: 'pre-tool-use',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})

test('trigger feature blocks rm', async () => {
  const input = {"hook_event_name":"PreToolUse","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"rm -rf x"},"tool_use_id":"tid1","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'deny-rm',
    event: 'pre-tool-use',
    priority: 50,
    trigger: { '$.tool_name': 'Bash' },
    feature: { 'bash-command': { value: { path: '$.tool_input.command', name: 'rm' } } },
    output: { decision: 'block', reason: 'rm denied' },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.decision, 'block')
})

test('subagent tool context is valid optional SDU identity', async () => {
  const input = {"hook_event_name":"PreToolUse","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","agent_id":"agent1","agent_type":"subagent","tool_name":"Bash","tool_input":{"command":"ls"},"tool_use_id":"tid1","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const result = await handle(input, [])
  assert.equal(result.output, null)
})

test('default permission mode blocks before rule evaluation', async () => {
  const input = {"hook_event_name":"PreToolUse","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"default","tool_name":"Bash","tool_input":{"command":"ls"},"tool_use_id":"tid1","transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const result = await handle(input, [])
  assert.equal(result.fired_rule_id, null)
  assert.equal(result.output.decision, 'block')
  assert.equal(result.output.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(result.output.reason, /bypassPermissions/)
})
