import test from 'node:test'
import assert from 'node:assert/strict'
import { handle } from './post-compact.mjs'

test('SDU validate fail throws', async () => {
  await assert.rejects(() => handle({ hook_event_name: 'bad' }, []), /sdu/)
})

test('trigger rule emits PDU', async () => {
  const input = {"hook_event_name":"PostCompact","session_id":"sess1","cwd":"/tmp","model":"gpt4","transcript_path":"/tmp/t.txt","trigger":"manual","turn_id":"turn1"}
  const rules = [{
    id: 'const-rule',
    event: 'post-compact',
    priority: 100,
    output: { continue: true },
  }]
  const result = await handle(input, rules)
  assert.ok(result.output !== null, 'expected output')
  assert.equal(result.output.continue, true)
})