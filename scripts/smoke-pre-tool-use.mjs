#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, [
  'src/adapters/cli.mjs',
  'run',
  'test/fixtures/pre-tool-use-bash-rm.json',
  '--rules',
  'policy/rules',
], { encoding: 'utf8' })

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const output = JSON.parse(result.stdout)
if (output.decision !== 'block') throw new Error(`expected block decision, got ${output.decision}`)
if (output.hookSpecificOutput?.hookEventName !== 'PreToolUse') throw new Error('expected PreToolUse hookSpecificOutput')
if (output.hookSpecificOutput?.permissionDecision !== 'deny') throw new Error('expected permissionDecision deny')

console.log(JSON.stringify({ ok: true, decision: output.decision, permissionDecision: output.hookSpecificOutput.permissionDecision }, null, 2))
