import path from 'node:path'
import { listEvents, wireFromKebab } from '../core/handlers.mjs'
import { rootPath } from '../core/load.mjs'

export function renderHooksConfig(options = {}) {
  const rulesRoot = options.rulesRoot ?? 'policy/rules'
  const profilePath = options.profilePath
  const logPath = options.logPath
  const command = options.command ?? defaultCommand({ rulesRoot, profilePath, logPath })
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
  const logPath = options.logPath
  const cliPath = path.join(rootPath(), 'src/adapters/cli.mjs')
  const parts = ['node', quote(cliPath), 'hook', '--rules', quote(rulesRoot)]
  if (profilePath) parts.push('--profile', quote(profilePath))
  if (logPath) parts.push('--log', quote(logPath))
  return parts.join(' ')
}

function quote(value) {
  return JSON.stringify(value)
}
