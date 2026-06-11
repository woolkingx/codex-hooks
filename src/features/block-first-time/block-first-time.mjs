import { firstTimeStatus, markFirstTime } from '../../status/hook-state.mjs'

export const name = 'block-first-time'

export function inputPaths() {
  return []
}

export function evaluate(config, input, context = {}) {
  if (!context.hookState) return false
  return firstTimeStatus(context.hookState, {
    cwd: input.cwd,
    sessionId: input.session_id,
    key: config.key,
  }).first
}

export function commit(config, input, context = {}) {
  if (!context.hookState) return null
  return markFirstTime(context.hookState, {
    cwd: input.cwd,
    sessionId: input.session_id,
    key: config.key,
    now: context.now,
    limits: context.hookStateLimits,
  })
}
