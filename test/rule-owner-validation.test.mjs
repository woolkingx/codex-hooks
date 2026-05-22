import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import preToolUseFixture from './fixtures/pre-tool-use-bash-rm.json' with { type: 'json' }
import { runHook } from '../src/core/run.mjs'

function mkRulesRoot(eventDir, ruleId, rule) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-rules-'))
  const dir = path.join(tmp, eventDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${ruleId}.rule.json`), JSON.stringify(rule))
  return tmp
}

test('runtime rule load rejects read path not in input schema', async () => {
  const tmp = mkRulesRoot('pre-tool-use', 'bad-input', {
    id: 'bad-input-path',
    event: 'pre-tool-use',
    trigger: { '$.definitely_missing': 'x' },
    output: { continue: true },
  })
  try {
    await assert.rejects(
      () => runHook(preToolUseFixture, { rulesRoot: tmp, failClosed: false }),
      err => /rule-transition-invalid/.test(err.message) && /definitely_missing/.test(err.message),
    )
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('runtime rule load rejects feature path outside event input schema', async () => {
  const sessionFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/session-start-startup.json', import.meta.url), 'utf8'))
  const tmp = mkRulesRoot('session-start', 'bash-on-session', {
    id: 'bash-on-session',
    event: 'session-start',
    feature: { 'bash-command': { value: { path: '$.tool_input.command', name: 'rm' } } },
    output: { continue: true },
  })
  try {
    await assert.rejects(
      () => runHook(sessionFixture, { rulesRoot: tmp, failClosed: false }),
      err => /rule-transition-invalid/.test(err.message) && /tool_input/.test(err.message),
    )
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('canonical policy/rules still loads under runtime owner validation', async () => {
  const result = await runHook(preToolUseFixture, { rulesRoot: 'policy/rules', failClosed: false })
  assert.ok(result, 'runHook returned a result')
  assert.equal(result.fired_rule_id, 'deny-rm')
})
