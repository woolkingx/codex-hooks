import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyRule, applyRuleWithEffects, resolveInput, validateRuleTransition } from '../src/core/transition.mjs'
import { createHookState } from '../src/status/hook-state.mjs'

describe('applyRule', () => {
  it('returns output for matching trigger and feature data', () => {
    const rule = {
      id: 'deny-rm',
      event: 'pre-tool-use',
      trigger: { '$.tool_name': 'Bash' },
      feature: { 'bash-command': { value: { path: '$.tool_input.command', name: 'rm' } } },
      output: { decision: 'block' },
    }
    assert.deepEqual(applyRule(rule, { tool_name: 'Bash', tool_input: { command: 'rm -rf tmp' } }), { decision: 'block' })
    assert.equal(applyRule(rule, { tool_name: 'Bash', tool_input: { command: 'ls' } }), null)
    assert.equal(applyRule(rule, { tool_name: 'apply_patch', tool_input: { command: 'rm -rf tmp' } }), null)
  })

  it('supports feature any/all composition', () => {
    const rule = {
      id: 'composition-sample',
      event: 'pre-tool-use',
      trigger: { '$.tool_name': 'Bash' },
      feature: {
        'bash-command': {
          value: {
            any: [
              { path: '$.tool_input.command', flags: { name: 'sed', contains: ['-i'] } },
              { all: [
                { path: '$.tool_input.command', name: { regex: '^(sed|awk)$' } },
                { path: '$.tool_input.command', writes_to_file: true },
              ] },
            ],
          },
        },
      },
      output: { decision: 'block' },
    }
    assert.deepEqual(applyRule(rule, { tool_name: 'Bash', tool_input: { command: "awk '{print}' file > out" } }), { decision: 'block' })
    assert.deepEqual(applyRule(rule, { tool_name: 'Bash', tool_input: { command: "sed -i 's/a/b/' file" } }), { decision: 'block' })
    assert.equal(applyRule(rule, { tool_name: 'Bash', tool_input: { command: "awk '{print}' file" } }), null)
  })

  it('supports deferred feature effects', () => {
    const rule = {
      id: 'first-rg',
      event: 'pre-tool-use',
      trigger: { '$.tool_name': 'Bash' },
      feature: {
        'bash-command': { value: { path: '$.tool_input.command', name: 'rg' } },
        'block-first-time': { key: 'structural-search' },
      },
      output: { decision: 'block' },
    }
    const input = { cwd: process.cwd(), session_id: 's1', tool_name: 'Bash', tool_input: { command: 'rg x' } }
    const context = { hookState: createHookState(), now: 1000 }
    const first = applyRuleWithEffects(rule, input, context)
    assert.deepEqual(first.output, { decision: 'block' })
    first.commit()
    assert.equal(applyRule(rule, input, context), null)
  })
})

describe('resolveInput', () => {
  it('resolves nested paths', () => {
    assert.equal(resolveInput({ a: { b: 'x' } }, '$.a.b'), 'x')
  })

  it('throws on missing path', () => {
    assert.throws(() => resolveInput({}, '$.missing'), /input-path-not-resolvable/)
  })
})

describe('validateRuleTransition', () => {
  it('accepts trigger and feature paths present in input schema', () => {
    const rule = {
      trigger: { '$.tool_name': 'Bash' },
      feature: { 'bash-command': { value: { path: '$.tool_input.command', name: 'rm' } } },
      output: { continue: true },
    }
    const sduSchema = {
      type: 'object',
      properties: {
        tool_name: { type: 'string' },
        tool_input: { type: 'object', properties: { command: { type: 'string' } } },
      },
    }
    assert.doesNotThrow(() => validateRuleTransition(rule, { sduSchema }))
  })

  it('rejects trigger paths absent from input schema', () => {
    const rule = { trigger: { '$.missing': true }, output: { continue: true } }
    const sduSchema = { type: 'object', properties: { tool_name: { type: 'string' } } }
    assert.throws(() => validateRuleTransition(rule, { sduSchema }), /rule-transition-invalid/)
  })

  it('rejects malformed trigger paths', () => {
    const rule = { trigger: { '$tool_name': 'Bash' }, output: { continue: true } }
    const sduSchema = { type: 'object', properties: { tool_name: { type: 'string' } } }
    assert.throws(() => validateRuleTransition(rule, { sduSchema }), /rule-transition-invalid/)
  })

  it('rejects feature paths absent from input schema', () => {
    const rule = {
      feature: { 'bash-command': { value: { path: '$.missing', name: 'rm' } } },
      output: { continue: true },
    }
    const sduSchema = { type: 'object', properties: { tool_name: { type: 'string' } } }
    assert.throws(() => validateRuleTransition(rule, { sduSchema }), /rule-transition-invalid/)
  })
})
