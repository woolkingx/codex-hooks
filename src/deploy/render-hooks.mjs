import path from 'node:path'
import { listEvents, wireFromKebab } from '../core/handlers.mjs'
import { rootPath } from '../core/load.mjs'

export function renderHooksConfig(options = {}) {
  const rulesRoot = options.rulesRoot ?? 'policy/rules'
  const profilePath = options.profilePath
  const logPath = options.logPath ?? 'logs/codex-hooks.jsonl'
  const statePath = options.statePath ?? 'logs/codex-hooks-state.json'
  const command = options.command ?? defaultCommand({ rulesRoot, profilePath, logPath, statePath })
  const timeout = options.timeout ?? 30
  const hooks = {}
  const wireNames = listEvents().map(wireFromKebab).sort()
  for (const eventName of wireNames) {
    hooks[eventName] = [{
      matcher: options.matcher ?? '*',
      hooks: [{
        type: 'command',
        command,
        timeout,
        statusMessage: `codex-hooks ${eventName}`,
      }],
    }]
  }
  return { hooks }
}

export function defaultCommand(options = {}) {
  const rulesRoot = options.rulesRoot ?? 'policy/rules'
  const profilePath = options.profilePath
  const logPath = options.logPath ?? 'logs/codex-hooks.jsonl'
  const statePath = options.statePath ?? 'logs/codex-hooks-state.json'
  const cliPath = path.join(rootPath(), 'src/adapters/cli.mjs')
  const parts = ['node', quote(cliPath), 'hook', '--rules', quote(rulesRoot)]
  if (profilePath) parts.push('--profile', quote(profilePath))
  if (logPath) parts.push('--log', quote(logPath))
  if (statePath) parts.push('--state', quote(statePath))
  return parts.join(' ')
}

function quote(value) {
  return JSON.stringify(value)
}
