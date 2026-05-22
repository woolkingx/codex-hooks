import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildUserRuleSyncReport, loadUserPolicy, rulePathForRequirement } from '../src/policy/user.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function writeTemp(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-user-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(body, null, 2))
  return path.relative(ROOT, file)
}

function mkRulesRoot() {
  return path.relative(ROOT, fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-rules-')))
}

function writeRule(rulesRoot, event, fileId, rule) {
  const dir = path.join(ROOT, rulesRoot, event)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileId + '.rule.json'), JSON.stringify(rule, null, 2))
}

function writeRawRule(rulesRoot, event, fileId, text) {
  const dir = path.join(ROOT, rulesRoot, event)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileId + '.rule.json'), text)
}

function validRule(id, event = 'pre-tool-use') {
  return {
    id,
    event,
    trigger: { '$.tool_name': 'Bash' },
    feature: {
      'bash-command': {
        value: { path: '$.tool_input.command', name: 'rm' },
      },
    },
    output: {
      decision: 'block',
      reason: 'test rule',
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'test rule',
      },
    },
  }
}

test('repo policy/user.json validates and is synchronized with bundled rules', () => {
  const policy = loadUserPolicy('policy/user.json')
  assert.equal(policy.version, '0.0.0')
  assert.ok(policy.requirements.length >= 13)
  const report = buildUserRuleSyncReport({ userPath: 'policy/user.json', rulesRoot: 'policy/rules' })
  assert.equal(report.ok, true)
  assert.equal(report.orphan_rules.length, 0)
  assert.equal(report.requirements.length, report.rules.length)
})

test('valid requirement passes with enabled defaulting to true', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [
      { id: 'deny-rm', event: 'pre-tool-use', requirement: 'Block destructive rm.' },
    ],
  })
  const policy = loadUserPolicy(rel)
  assert.equal(policy.requirements.length, 1)
  assert.equal(policy.requirements[0].enabled ?? true, true)
})

test('unknown event rejected', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'x', event: 'not-an-event', requirement: 'x' }],
  })
  assert.throws(() => loadUserPolicy(rel), /event/i)
})

test('non kebab-case id rejected', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'Bad_Id', event: 'pre-tool-use', requirement: 'x' }],
  })
  assert.throws(() => loadUserPolicy(rel))
})

test('duplicate requirement id rejected', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [
      { id: 'dup', event: 'pre-tool-use', requirement: 'a' },
      { id: 'dup', event: 'post-tool-use', requirement: 'b' },
    ],
  })
  assert.throws(() => loadUserPolicy(rel), /duplicate/)
})

test('missing requirement rejected', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'x', event: 'pre-tool-use' }],
  })
  assert.throws(() => loadUserPolicy(rel))
})

test('missing file throws', () => {
  assert.throws(() => loadUserPolicy('policy/does-not-exist.json'), /not found/)
})

test('rule path is derived from requirement id and event', () => {
  const rulePath = rulePathForRequirement({ id: 'deny-rm', event: 'pre-tool-use' })
  assert.equal(rulePath, 'policy/rules/pre-tool-use/deny-rm.rule.json')
})

test('sync report detects missing rule file', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [
      { id: 'missing-rule', event: 'pre-tool-use', requirement: 'Missing rule.' },
    ],
  })
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot: mkRulesRoot() })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'missing')
  assert.equal(report.requirements[0].rule_path.endsWith('/pre-tool-use/missing-rule.rule.json'), true)
})

test('sync report detects orphan rule file', () => {
  const rel = writeTemp('user.json', { version: '0.0.1', requirements: [] })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'orphan-rule', validRule('orphan-rule'))
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.orphan_rules.length, 1)
  assert.equal(report.orphan_rules[0].state, 'orphan')
})

test('sync report detects rule id mismatch from requirement path', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'expected-rule', event: 'pre-tool-use', requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'expected-rule', validRule('actual-rule'))
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'id-mismatch')
  assert.equal(report.rules[0].state, 'path-id-mismatch')
})

test('sync report detects rule event mismatch from requirement path', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'event-rule', event: 'pre-tool-use', requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'event-rule', validRule('event-rule', 'post-tool-use'))
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'event-mismatch')
  assert.equal(report.rules[0].state, 'path-event-mismatch')
})

test('sync report detects invalid json rule file', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'bad-json', event: 'pre-tool-use', requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRawRule(rulesRoot, 'pre-tool-use', 'bad-json', '{')
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'invalid-json')
  assert.equal(report.rules[0].state, 'invalid-json')
})

test('sync report detects invalid rule schema', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'invalid-rule', event: 'pre-tool-use', requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'invalid-rule', { id: 'invalid-rule', event: 'pre-tool-use' })
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'invalid-rule')
  assert.equal(report.rules[0].state, 'invalid-rule')
})


test('sync report treats missing enabled on both sides as true', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'enabled-default', event: 'pre-tool-use', requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'enabled-default', validRule('enabled-default'))
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, true)
  assert.equal(report.requirements[0].state, 'ok')
})

test('sync report detects enabled mismatch', () => {
  const rel = writeTemp('user.json', {
    version: '0.0.1',
    requirements: [{ id: 'disabled-rule', event: 'pre-tool-use', enabled: false, requirement: 'x' }],
  })
  const rulesRoot = mkRulesRoot()
  writeRule(rulesRoot, 'pre-tool-use', 'disabled-rule', { ...validRule('disabled-rule'), enabled: true })
  const report = buildUserRuleSyncReport({ userPath: rel, rulesRoot })
  assert.equal(report.ok, false)
  assert.equal(report.requirements[0].state, 'enabled-mismatch')
  assert.equal(report.requirements[0].requirement_enabled, false)
  assert.equal(report.requirements[0].rule_enabled, true)
})
