import test from 'node:test'
import assert from 'node:assert/strict'
import { listEvents, wireFromKebab } from '../src/core/handlers.mjs'
import { ensureSchemaValid, schemaRefs } from '../src/core/schema-tree.mjs'
import { createInstallPlan, renderHooksConfig, runDoctor } from '../src/deploy/index.mjs'

test('render-hooks emits every official event owner', () => {
  const config = renderHooksConfig({ rulesRoot: 'policy/rules' })
  const expected = listEvents().map(wireFromKebab).sort()
  assert.deepEqual(Object.keys(config.hooks).sort(), expected)
})

test('render-hooks writes project-local ignored logs by default', () => {
  const config = renderHooksConfig({ rulesRoot: 'policy/rules' })
  for (const groups of Object.values(config.hooks)) {
    const command = groups[0].hooks[0].command
    assert.match(command, / --log "logs\/codex-hooks\.jsonl"/)
    assert.match(command, / --state "logs\/codex-hooks-state\.json"/)
  }
})

test('render-hooks injects log path into every generated command when configured', () => {
  const config = renderHooksConfig({ rulesRoot: 'policy/rules', logPath: 'hooks.jsonl' })
  for (const groups of Object.values(config.hooks)) {
    const command = groups[0].hooks[0].command
    assert.match(command, / --log "hooks\.jsonl"/)
  }
})

test('doctor checks deploy-critical schema and owner gates', () => {
  const result = runDoctor({ rulesRoot: 'policy/rules', target: 'project' })
  const checks = Object.fromEntries(result.doctor.checks.map(check => [check.name, check]))
  assert.notEqual(checks.policy_sync?.status, 'fail')
  assert.equal(checks.event_owner_coverage?.status, 'pass')
  assert.equal(checks.data_schemas?.status, 'pass')
})

test('install plan is deploy schema data and remains dry-run by default', () => {
  const plan = createInstallPlan({ rulesRoot: 'policy/rules', target: 'project', cwd: process.cwd() })
  assert.doesNotThrow(() => ensureSchemaValid(plan, schemaRefs.system('deploy'), 'deploy'))
  assert.equal(plan.installation.mode, 'dry-run')
  assert.ok(Array.isArray(plan.installation.will_write))
})
