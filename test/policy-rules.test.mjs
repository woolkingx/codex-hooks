import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyRule, applyRuleWithEffects } from '../src/core/transition.mjs'
import { createHookState } from '../src/status/hook-state.mjs'

function readRule(id) {
  return JSON.parse(readFileSync(`policy/rules/pre-tool-use/${id}.rule.json`, 'utf8'))
}

function sdu(command) {
  return {
    cwd: process.cwd(),
    session_id: 'policy-rules-test',
    tool_name: 'Bash',
    tool_input: { command },
  }
}

describe('policy-rules integration', () => {
  describe('deny-bash-find', () => {
    it('fires on find -delete', () => {
      const result = applyRule(readRule('deny-bash-find'), sdu('find . -name "*.tmp" -delete'))
      assert.ok(result && result.decision === 'block')
    })

    it('does not fire on plain find', () => {
      const result = applyRule(readRule('deny-bash-find'), sdu('find . -name "*.txt"'))
      assert.strictEqual(result, null)
    })
  })

  describe('deny-rsync-delete', () => {
    it('fires on rsync --delete', () => {
      const result = applyRule(readRule('deny-rsync-delete'), sdu('rsync -av --delete src/ dst/'))
      assert.ok(result && result.decision === 'block')
    })

    it('does not fire on plain rsync', () => {
      const result = applyRule(readRule('deny-rsync-delete'), sdu('rsync -av src/ dst/'))
      assert.strictEqual(result, null)
    })
  })

  describe('deny-git-reset-hard', () => {
    it('fires on git reset --hard', () => {
      const result = applyRule(readRule('deny-git-reset-hard'), sdu('git reset --hard HEAD'))
      assert.ok(result && result.decision === 'block')
    })

    it('does not fire on git reset --soft', () => {
      const result = applyRule(readRule('deny-git-reset-hard'), sdu('git reset --soft HEAD'))
      assert.strictEqual(result, null)
    })
  })

  describe('deny-echo-write', () => {
    it('fires on printf stdout file redirection', () => {
      const result = applyRule(readRule('deny-echo-write'), sdu("printf 'x' > file"))
      assert.ok(result && result.decision === 'block')
    })

    it('does not fire on printf stderr redirection to /dev/null', () => {
      const result = applyRule(readRule('deny-echo-write'), sdu("printf 'x' 2>/dev/null"))
      assert.strictEqual(result, null)
    })
  })

  describe('first structural search gates', () => {
    it('rg and find share one first-time structural-search key', () => {
      const state = createHookState()
      const context = { hookState: state, now: 1000 }
      const rg = readRule('first-rg-structure-gate')
      const find = readRule('first-find-structure-gate')
      const result = applyRuleWithEffects(rg, sdu('rg owner'), context)
      assert.ok(result?.output?.decision === 'block')
      result.commit()
      assert.equal(applyRule(find, sdu('find . -name "*.mjs"'), context), null)
    })
  })

})
