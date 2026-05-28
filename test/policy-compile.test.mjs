import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CLI = new URL('../src/adapters/cli.mjs', import.meta.url).pathname
const ROOT = path.resolve(path.dirname(CLI), '../..')

function policyRequirementIds() {
  const policy = JSON.parse(readFileSync(new URL('../policy/user.json', import.meta.url), 'utf8'))
  return policy.requirements.map(requirement => requirement.id).sort()
}

function runCli(...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  })
}

function writeTemp(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-cli-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(body, null, 2))
  return path.relative(ROOT, file)
}

function mkRulesRoot() {
  return path.relative(ROOT, fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-cli-rules-')))
}

function writeRule(rulesRoot, event, fileId, rule) {
  const dir = path.join(ROOT, rulesRoot, event)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileId + '.rule.json'), JSON.stringify(rule, null, 2))
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

describe('policy build', () => {
  it('runs and reports compiler instructions for policy/user.json', () => {
    const out = runCli('policy', 'build')
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.ok(Array.isArray(result.instructions))
    assert.deepEqual(result.instructions.map(item => item.requirement_id).sort(), policyRequirementIds())
    assert.equal(result.instructions.some(item => item.requirement_id === 'deny-rm'), true)
  })
})

describe('policy requirements', () => {
  it('lists requirements from policy/user.json', () => {
    const out = runCli('policy', 'requirements', 'list')
    const result = JSON.parse(out)
    assert.equal(result.version, '0.0.0')
    assert.ok(Array.isArray(result.requirements))
  })

  it('validates policy/user.json', () => {
    const out = runCli('policy', 'requirements', 'validate')
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
  })

  it('syncs policy/user.json with runtime rules bidirectionally', () => {
    const out = runCli('policy', 'requirements', 'sync')
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.deepEqual(result.requirements.map(item => item.id).sort(), policyRequirementIds())
    assert.equal(result.requirements.length, result.rules.length)
    assert.deepEqual(result.orphan_rules, [])
  })

  it('sets, toggles, and removes requirements through the owner CLI', () => {
    const file = writeTemp('user.json', { version: '0.0.1', requirements: [] })
    let out = runCli(
      'policy',
      'requirements',
      'set',
      'deny-test',
      '--file',
      file,
      '--event',
      'pre-tool-use',
      '--requirement',
      'Block test command.',
      '--enabled',
      'false',
    )
    let result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.equal(result.requirement.id, 'deny-test')
    assert.equal(result.requirement.enabled, false)

    out = runCli('policy', 'requirements', 'enable', 'deny-test', '--file', file)
    result = JSON.parse(out)
    assert.equal(result.requirement.enabled, true)

    out = runCli('policy', 'requirements', 'disable', 'deny-test', '--file', file)
    result = JSON.parse(out)
    assert.equal(result.requirement.enabled, false)

    out = runCli('policy', 'requirements', 'remove', 'deny-test', '--file', file)
    result = JSON.parse(out)
    assert.equal(result.removed.id, 'deny-test')
    const policy = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    assert.deepEqual(policy.requirements, [])
  })
})

describe('policy compile write', () => {
  it('writes enabled projection fixes and removes orphan rules', () => {
    const file = writeTemp('user.json', {
      version: '0.0.1',
      requirements: [
        { id: 'disabled-rule', event: 'pre-tool-use', enabled: false, requirement: 'Disable rule.' },
      ],
    })
    const rulesRoot = mkRulesRoot()
    writeRule(rulesRoot, 'pre-tool-use', 'disabled-rule', { ...validRule('disabled-rule'), enabled: true })
    writeRule(rulesRoot, 'pre-tool-use', 'orphan-rule', validRule('orphan-rule'))

    const out = runCli('policy', 'compile', '--user', file, '--out', rulesRoot, '--write')
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.equal(result.updated_rules.length, 1)
    assert.equal(result.removed_orphans.length, 1)
    const rule = JSON.parse(fs.readFileSync(path.join(ROOT, rulesRoot, 'pre-tool-use', 'disabled-rule.rule.json'), 'utf8'))
    assert.equal(rule.enabled, false)
    assert.equal(fs.existsSync(path.join(ROOT, rulesRoot, 'pre-tool-use', 'orphan-rule.rule.json')), false)
  })
})

describe('policy verify-command', () => {
  it('allows sed stderr redirection after deny-sed-awk removal', () => {
    const out = runCli(
      'policy',
      'verify-command',
      '--event',
      'pre-tool-use',
      '--command',
      "sed -n '1,20p' file 2>/dev/null",
      '--expect',
      'allow',
    )
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.equal(result.actual, 'allow')
  })

  it('allows printf stderr redirection to /dev/null', () => {
    const out = runCli(
      'policy',
      'verify-command',
      '--event',
      'pre-tool-use',
      '--command',
      "printf 'x' 2>/dev/null",
      '--expect',
      'allow',
    )
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.equal(result.actual, 'allow')
  })

  it('blocks destructive rm commands', () => {
    const out = runCli(
      'policy',
      'verify-command',
      '--event',
      'pre-tool-use',
      '--command',
      'rm -rf /tmp/codex-hooks-target',
      '--expect',
      'block',
    )
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.equal(result.actual, 'block')
  })
})

describe('policy explain', () => {
  it('returns source for existing rule', () => {
    const out = runCli('policy', 'explain', 'deny-rm')
    const result = JSON.parse(out)
    assert.equal(result.id, 'deny-rm')
    assert.deepEqual(result.trigger_paths, ['$.tool_name'])
    assert.deepEqual(result.features, ['bash-command'])
  })
})
