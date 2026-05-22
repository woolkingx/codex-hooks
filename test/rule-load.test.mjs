import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadRules } from '../src/core/load.mjs'

const VALID_RULES_ROOT = 'policy/rules'

test('valid trigger feature rules load ok', () => {
  const result = loadRules({ rulesRoot: VALID_RULES_ROOT })
  assert.ok(result.rules.length >= 1, 'expected at least one rule')
  const rule = result.rules[0]
  assert.ok(rule.id, 'rule has id')
  assert.ok(rule.event, 'rule has event')
  assert.ok(rule.output, 'rule has output')
})

test('old fields rule is rejected', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-test-'))
  const subDir = path.join(tmpDir, 'pre-tool-use')
  fs.mkdirSync(subDir)
  const badRule = { id: 'bad-rule', event: 'pre-tool-use', fields: [{ output: { continue: true } }] }
  fs.writeFileSync(path.join(subDir, 'bad-rule.rule.json'), JSON.stringify(badRule))
  assert.throws(() => loadRules({ rulesRoot: tmpDir }), /additional property "fields"|missing required "output"/)
  fs.rmSync(tmpDir, { recursive: true })
})

test('unknown feature is rejected by event rule schema', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-test-'))
  const subDir = path.join(tmpDir, 'pre-tool-use')
  fs.mkdirSync(subDir)
  const rule = {
    id: 'unknown-feature-rule',
    event: 'pre-tool-use',
    feature: { future: { value: true } },
    output: { continue: true },
  }
  fs.writeFileSync(path.join(subDir, 'unknown-feature-rule.rule.json'), JSON.stringify(rule))
  assert.throws(() => loadRules({ rulesRoot: tmpDir }), /additional property "future"/)
  fs.rmSync(tmpDir, { recursive: true })
})

test('malformed output is rejected by official output schema ref', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-test-'))
  const subDir = path.join(tmpDir, 'pre-tool-use')
  fs.mkdirSync(subDir)
  const rule = {
    id: 'bad-output-rule',
    event: 'pre-tool-use',
    output: { decision: 'deny' },
  }
  fs.writeFileSync(path.join(subDir, 'bad-output-rule.rule.json'), JSON.stringify(rule))
  assert.throws(() => loadRules({ rulesRoot: tmpDir }), /must equal const|not in enum/)
  fs.rmSync(tmpDir, { recursive: true })
})
