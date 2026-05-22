import fs from 'node:fs'
import path from 'node:path'

export function createRepeatState(options = {}) {
  return options.state ?? { sessions: {} }
}

export function readRepeatState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return createRepeatState()
  return createRepeatState({ state: JSON.parse(fs.readFileSync(filePath, 'utf8')) })
}

export function writeRepeatState(filePath, state) {
  if (!filePath) return state
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`)
  return state
}

export function shouldSuppress(state, sessionId, ruleId, config = {}, now = Date.now()) {
  if (config.mode === 'always') return false
  const record = state.sessions?.[sessionId]?.[ruleId]
  if (!record) return false
  if (config.mode === 'cooldown') return now - record.last_fired_at < cooldownMs(config)
  return true
}

export function markFired(state, sessionId, ruleId, now = Date.now()) {
  if (!state.sessions[sessionId]) state.sessions[sessionId] = {}
  state.sessions[sessionId][ruleId] = { last_fired_at: now }
  return state
}

export function clearSession(state, sessionId) {
  delete state.sessions[sessionId]
  return state
}

function cooldownMs(config) {
  return Math.max(0, Number(config.seconds ?? 0)) * 1000
}
