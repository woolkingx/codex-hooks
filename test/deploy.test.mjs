import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

test('public projection publish jobs do not expose GitLab control-plane identity', () => {
  if (!fs.existsSync('.gitlab-ci.yml')) {
    assert.equal(fs.existsSync('scripts/publish_public_repos.sh'), false)
    return
  }
  const ci = fs.readFileSync('.gitlab-ci.yml', 'utf8')
  const publicRepos = ci.match(/publish_public_repositories:[\s\S]*?(?=\npublish_wiki_projection:)/)?.[0] || ''
  const publicWikis = ci.match(/publish_wiki_projection:[\s\S]*?(?=\nclose_public_projection_approval:)/)?.[0] || ''
  assert.match(publicRepos, /git config --global user\.name "codex-hooks release bot"/)
  assert.match(publicWikis, /git config --global user\.name "codex-hooks release bot"/)
  assert.doesNotMatch(publicRepos, /GitLab CI/)
  assert.doesNotMatch(publicWikis, /GitLab CI/)

  const publicPublisher = fs.readFileSync('scripts/publish_public_repos.sh', 'utf8')
  assert.match(publicPublisher, /"\.gitlab-ci\.yml"/)
  assert.doesNotMatch(publicPublisher, /gitlab release/i)
})

test('public wiki projection skips missing wiki remotes unless required', () => {
  if (!fs.existsSync('scripts/publish_wikis.sh')) {
    assert.equal(fs.existsSync('.gitlab-ci.yml'), false)
    return
  }
  const wikiPublisher = fs.readFileSync('scripts/publish_wikis.sh', 'utf8')
  assert.match(wikiPublisher, /wiki skipped: \$\{label\} remote missing/)
  assert.match(wikiPublisher, /PUBLIC_WIKI_REQUIRED:-0/)
  assert.match(wikiPublisher, /not found\|wiki is disabled/)
})
