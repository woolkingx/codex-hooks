import fs from 'node:fs'
import path from 'node:path'
import { ensureSchemaValid } from '../core/schema-tree.mjs'

export const DEFAULT_HOOK_STATE_PATH = 'logs/codex-hooks-state.json'
export const DEFAULT_HOOK_STATE_LIMITS = Object.freeze({
  ttlMs: 48 * 60 * 60 * 1000,
  maxProjects: 100,
  maxSessionsPerProject: 100,
  maxSeenPerSession: 200,
  maxCompactsPerSession: 20,
})

export function createHookState() {
  return { version: '0.0.1', projects: {} }
}

export function normalizeCwd(cwd = process.cwd()) {
  const value = String(cwd || '.')
  const absolute = path.resolve(value)
  try {
    return fs.realpathSync(absolute)
  } catch {
    return absolute
  }
}

export function loadHookState(filePath = DEFAULT_HOOK_STATE_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return createHookState()
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  validateHookState(state)
  return state
}

export function saveHookState(filePath = DEFAULT_HOOK_STATE_PATH, state) {
  validateHookState(state)
  if (!filePath) return state
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`)
  fs.renameSync(temp, filePath)
  return state
}

export function validateHookState(state) {
  return ensureSchemaValid(state, 'status.schema.json#/definitions/hook_state', 'hook_state')
}

export function ensureSession(state, { cwd, sessionId, now = Date.now() } = {}) {
  if (!sessionId) throw new TypeError('sessionId is required')
  const projectKey = normalizeCwd(cwd)
  if (!state.projects[projectKey]) {
    state.projects[projectKey] = { updated_at: now, sessions: {} }
  }
  const project = state.projects[projectKey]
  project.updated_at = now
  if (!project.sessions[sessionId]) {
    project.sessions[sessionId] = {
      updated_at: now,
      compact_mark: 0,
      processed_compacts: {},
      seen: {},
    }
  }
  const session = project.sessions[sessionId]
  session.updated_at = now
  return { projectKey, project, session }
}

export function advanceCompactMark(state, { cwd, sessionId, turnId, now = Date.now(), limits } = {}) {
  if (!turnId) throw new TypeError('turnId is required')
  pruneHookState(state, { now, limits })
  const { projectKey, session } = ensureSession(state, { cwd, sessionId, now })
  if (session.processed_compacts[turnId] !== undefined) {
    return { changed: false, projectKey, compact_mark: session.compact_mark }
  }
  session.compact_mark += 1
  session.processed_compacts[turnId] = now
  pruneHookState(state, { now, limits })
  return { changed: true, projectKey, compact_mark: session.compact_mark }
}

export function markFirstTime(state, { cwd, sessionId, key, now = Date.now(), limits } = {}) {
  if (!key) throw new TypeError('key is required')
  pruneHookState(state, { now, limits })
  const { projectKey, session } = ensureSession(state, { cwd, sessionId, now })
  const seenKey = `${session.compact_mark}:${key}`
  if (session.seen[seenKey] !== undefined) {
    return { first: false, projectKey, compact_mark: session.compact_mark, seen_key: seenKey }
  }
  session.seen[seenKey] = now
  pruneHookState(state, { now, limits })
  return { first: true, projectKey, compact_mark: session.compact_mark, seen_key: seenKey }
}

export function firstTimeStatus(state, { cwd, sessionId, key } = {}) {
  if (!state) throw new TypeError('hook state is required')
  if (!sessionId) throw new TypeError('sessionId is required')
  if (!key) throw new TypeError('key is required')
  const projectKey = normalizeCwd(cwd)
  const session = state.projects?.[projectKey]?.sessions?.[sessionId]
  const compactMark = session?.compact_mark ?? 0
  const seenKey = `${compactMark}:${key}`
  return {
    first: session?.seen?.[seenKey] === undefined,
    projectKey,
    compact_mark: compactMark,
    seen_key: seenKey,
  }
}

export function pruneHookState(state, { now = Date.now(), limits } = {}) {
  const effective = { ...DEFAULT_HOOK_STATE_LIMITS, ...(limits ?? {}) }
  for (const [projectKey, project] of Object.entries(state.projects)) {
    if (isExpired(project.updated_at, now, effective.ttlMs)) {
      delete state.projects[projectKey]
      continue
    }
    pruneRecordMap(project.sessions, {
      now,
      ttlMs: effective.ttlMs,
      max: effective.maxSessionsPerProject,
      timestamp: item => item.updated_at,
    })
    for (const session of Object.values(project.sessions)) {
      pruneRecordMap(session.processed_compacts, {
        now,
        ttlMs: effective.ttlMs,
        max: effective.maxCompactsPerSession,
        timestamp: value => value,
      })
      pruneRecordMap(session.seen, {
        now,
        ttlMs: effective.ttlMs,
        max: effective.maxSeenPerSession,
        timestamp: value => value,
      })
    }
  }
  pruneRecordMap(state.projects, {
    now,
    ttlMs: effective.ttlMs,
    max: effective.maxProjects,
    timestamp: item => item.updated_at,
  })
  validateHookState(state)
  return state
}

function pruneRecordMap(map, { now, ttlMs, max, timestamp }) {
  for (const [key, value] of Object.entries(map)) {
    if (isExpired(timestamp(value), now, ttlMs)) delete map[key]
  }
  const entries = Object.entries(map)
  if (entries.length <= max) return
  entries
    .sort((a, b) => timestamp(a[1]) - timestamp(b[1]))
    .slice(0, entries.length - max)
    .forEach(([key]) => { delete map[key] })
}

function isExpired(value, now, ttlMs) {
  return Number.isFinite(value) && ttlMs >= 0 && now - value > ttlMs
}
