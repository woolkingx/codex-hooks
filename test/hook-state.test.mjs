import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  advanceCompactMark,
  createHookState,
  loadHookState,
  markFirstTime,
  normalizeCwd,
  pruneHookState,
  saveHookState,
  validateHookState,
} from '../src/status/hook-state.mjs'

test('hook state validates empty owner shape', () => {
  assert.doesNotThrow(() => validateHookState(createHookState()))
})

test('normalizeCwd resolves existing project context', () => {
  assert.equal(normalizeCwd('.'), fs.realpathSync(process.cwd()))
})

test('markFirstTime blocks once per cwd session compact mark and key', () => {
  const state = createHookState()
  const first = markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1000 })
  const second = markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1001 })
  assert.equal(first.first, true)
  assert.equal(first.seen_key, '0:structural-search')
  assert.equal(second.first, false)
  assert.equal(second.seen_key, '0:structural-search')
})

test('advanceCompactMark resets first-time scope and is idempotent by turn_id', () => {
  const state = createHookState()
  assert.equal(markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1000 }).first, true)
  assert.deepEqual(advanceCompactMark(state, { cwd: '.', sessionId: 's1', turnId: 't1', now: 1001 }), {
    changed: true,
    projectKey: fs.realpathSync(process.cwd()),
    compact_mark: 1,
  })
  assert.equal(advanceCompactMark(state, { cwd: '.', sessionId: 's1', turnId: 't1', now: 1002 }).changed, false)
  assert.equal(markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1003 }).first, true)
  assert.equal(markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1004 }).first, false)
})

test('hook state prunes by ttl and caps', () => {
  const state = createHookState()
  markFirstTime(state, { cwd: '.', sessionId: 'old', key: 'a', now: 1000 })
  markFirstTime(state, { cwd: '.', sessionId: 'new', key: 'a', now: 3000 })
  pruneHookState(state, { now: 3000, limits: { ttlMs: 1500, maxProjects: 10, maxSessionsPerProject: 10, maxSeenPerSession: 10, maxCompactsPerSession: 10 } })
  const project = state.projects[fs.realpathSync(process.cwd())]
  assert.equal(project.sessions.old, undefined)
  assert.ok(project.sessions.new)

  for (let index = 0; index < 5; index++) {
    markFirstTime(state, { cwd: '.', sessionId: 'new', key: `k${index}`, now: 3001 + index })
  }
  pruneHookState(state, { now: 3010, limits: { ttlMs: 10000, maxProjects: 10, maxSessionsPerProject: 10, maxSeenPerSession: 2, maxCompactsPerSession: 10 } })
  assert.equal(Object.keys(project.sessions.new.seen).length, 2)
})

test('hook state persists through JSON file owner API', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-state-'))
  const file = path.join(dir, 'state.json')
  const state = createHookState()
  markFirstTime(state, { cwd: '.', sessionId: 's1', key: 'structural-search', now: 1000 })
  saveHookState(file, state)
  assert.deepEqual(loadHookState(file), state)
})
