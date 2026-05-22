import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CLI = new URL('../src/adapters/cli.mjs', import.meta.url).pathname

function runCli(...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(path.dirname(CLI), '../..'),
  })
}

describe('policy build', () => {
  it('runs and reports compiler instructions for policy/user.json', () => {
    const out = runCli('policy', 'build')
    const result = JSON.parse(out)
    assert.equal(result.ok, true)
    assert.ok(Array.isArray(result.instructions))
    assert.ok(result.instructions.length >= 13)
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
    assert.ok(result.requirements.length >= 13)
    assert.equal(result.requirements.length, result.rules.length)
    assert.deepEqual(result.orphan_rules, [])
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
