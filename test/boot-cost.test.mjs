import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const PROBE = `
import fs from 'node:fs'
let count = 0
const orig = fs.readFileSync
fs.readFileSync = function (...args) { count++; return orig.apply(this, args) }
const { runHook } = await import('./src/core/run.mjs')
const input = {
  hook_event_name: 'PreToolUse',
  cwd: '/tmp', model: 'opus', permission_mode: 'default',
  session_id: 's', turn_id: 't', transcript_path: null,
  tool_input: { command: 'ls' }, tool_name: 'Bash', tool_use_id: 'u',
}
await runHook(input, { rules: [] })
process.stdout.write(JSON.stringify({ count }))
`

test('cold-start file read count stays bounded for a single event', () => {
  const result = spawnSync('node', ['--input-type=module', '-e', PROBE], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `probe failed: ${result.stderr}`)
  const { count } = JSON.parse(result.stdout)
  assert.ok(count <= 16,
    `cold-start read ${count} files; expected at most 16 for a single event invocation`)
})
