import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './permission-request.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"PermissionRequest","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"ls"},"transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'const-rule',
    event: 'permission-request',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})

test('default permission mode denies and prompts full-access mode', async () => {
  const input = {"hook_event_name":"PermissionRequest","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"default","tool_name":"Bash","tool_input":{"command":"ls"},"transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const result = await handle(input, [])
  assert.equal(result.fired_rule_id, null)
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'PermissionRequest')
  assert.equal(result.output.hookSpecificOutput.decision.behavior, 'deny')
  assert.match(result.output.hookSpecificOutput.decision.message, /bypassPermissions/)
})

test('permission request projects through compatible pre-tool-use rules', async () => {
  const input = {"hook_event_name":"PermissionRequest","session_id":"sess1","cwd":"/tmp","model":"gpt4","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"rm -rf tmp"},"transcript_path":"/tmp/t.txt","turn_id":"turn1"}
  const rules = [{
    id: 'deny-rm',
    event: 'pre-tool-use',
    priority: 50,
    trigger: {
      '$.tool_name': 'Bash',
    },
    feature: {
      'bash-command': {
        value: {
          path: '$.tool_input.command',
          name: 'rm',
        },
      },
    },
    output: {
      decision: 'block',
      reason: 'rm is disabled.',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'rm is disabled.',
      },
    },
  }]
  const result = await handle(input, rules)
  assert.equal(result.fired_rule_id, 'deny-rm')
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'PermissionRequest')
  assert.equal(result.output.hookSpecificOutput.decision.behavior, 'deny')
  assert.match(result.output.hookSpecificOutput.decision.message, /rm is disabled/)
})
