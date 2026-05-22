import { loadHandler } from './handlers.mjs'
import { loadRules, loadOfficialSchema, ensureValid } from './load.mjs'
import { toErrorPDU } from './errors.mjs'

export async function runHook(rawInput, options = {}) {
  const failClosed = options.failClosed ?? true
  const dryRun = options.dryRun ?? false
  try {
    return await runOnce(rawInput, options, dryRun)
  } catch (error) {
    if (!failClosed) throw error
    return await errorResult(rawInput, error)
  }
}

async function runOnce(rawInput, options, dryRun) {
  const entry = await loadHandler(rawInput?.hook_event_name)
  if (!entry) throw new TypeError(`no handler for hook_event_name: ${rawInput?.hook_event_name}`)
  const eventName = entry.meta.id
  const rules = options.rules ?? compileRules({ ...options, eventName })
  const effective = dryRun ? rules.map(r => ({ ...r, enabled: 'test' })) : rules
  return entry.handle(rawInput, effective, options)
}

function compileRules(options) {
  if (!(options.rulesRoot || options.profilePath)) return []
  return loadRules({
    rulesRoot: options.rulesRoot,
    profilePath: options.profilePath,
  }).rules
}

async function errorResult(rawInput, error) {
  const meta = await safeMeta(rawInput?.hook_event_name)
  const eventName = meta?.id ?? rawInput?.hook_event_name ?? 'unknown'
  const errorPDU = toErrorPDU(error, 'executor')
  if (!meta) {
    return {
      event: { instance: { id: null, event_name: eventName } },
      fired_rule_id: null,
      output: null,
      error: errorPDU,
    }
  }
  const output = failClosedOutput(meta, error)
  ensureValid(output, loadOfficialSchema(meta.id, 'output'), `${meta.id}.fail-closed-output`)
  return {
    event: { instance: { id: null, event_name: meta.id } },
    fired_rule_id: null,
    output,
    error: errorPDU,
  }
}

async function safeMeta(eventName) {
  if (!eventName) return null
  try {
    const entry = await loadHandler(eventName)
    return entry?.meta ?? null
  } catch {
    return null
  }
}

function failClosedOutput(meta, error) {
  const message = `codex-hooks error: ${error.message ?? String(error)}`
  if (meta.id === 'pre-tool-use') {
    return {
      decision: 'block',
      reason: message,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }
  }
  if (meta.id === 'permission-request') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message },
      },
    }
  }
  if (meta.id === 'post-tool-use') return { continue: false, stopReason: message }
  if (meta.id === 'stop') return { continue: false, stopReason: message }
  if (meta.output_actions?.includes('stop')) return { continue: false, stopReason: message }
  return { continue: true, systemMessage: message }
}
