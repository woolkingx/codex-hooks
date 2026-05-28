import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const PROBE = `
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
let count = 0
const reads = []
const root = path.resolve('.')
const orig = fs.readFileSync
function normalizeReadTarget(target) {
  const value = String(target)
  return value.startsWith('file:') ? fileURLToPath(value) : path.resolve(value)
}
function runtimeDataRead(file) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return relative.startsWith('schema/')
    || relative.startsWith('policy/')
    || relative === '.codex-hooks.json'
    || relative === '.codex/codex-hooks.json'
}
fs.readFileSync = function (...args) {
  count++
  reads.push(normalizeReadTarget(args[0]))
  return orig.apply(this, args)
}
const { runHook } = await import('./src/core/run.mjs')
const input = {
  hook_event_name: 'PreToolUse',
  cwd: '/tmp', model: 'opus', permission_mode: 'default',
  session_id: 's', turn_id: 't', transcript_path: null,
  tool_input: { command: 'ls' }, tool_name: 'Bash', tool_use_id: 'u',
}
await runHook(input, { rules: [] })
const dataReads = reads
  .filter(runtimeDataRead)
  .map(file => path.relative(root, file).split(path.sep).join('/'))
process.stdout.write(JSON.stringify({ count, dataReads }))
`

function expectedRuntimeDataReads(eventName) {
  const generated = `schema/api/openai-codex/generated/${eventName}.command`
  return [
    'schema/codex-hooks.schema.json',
    `${generated}.input.schema.json`,
    `${generated}.output.schema.json`,
  ]
}

test('cold-start runtime data reads stay within event schema surface', () => {
  const result = spawnSync('node', ['--input-type=module', '-e', PROBE], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `probe failed: ${result.stderr}`)
  const { count, dataReads } = JSON.parse(result.stdout)
  assert.deepEqual(dataReads, expectedRuntimeDataReads('pre-tool-use'),
    `cold-start read ${count} files; runtime data reads escaped the event schema surface`)
})
