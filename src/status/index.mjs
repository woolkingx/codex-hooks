import { readLogTail } from '../log/index.mjs'
import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'

export function buildStatus(entries, options = {}) {
  const recent = entries.map(recentRun)
  const errorRuns = entries.filter(entry => entry.error).length
  const result = {
    run_id: options.runId ?? '',
    health: errorRuns ? 'error' : 'ok',
    source_log: options.logPath ?? null,
    total_runs: entries.length,
    error_runs: errorRuns,
    rule_counts: ruleCounts(entries),
    repeat_state: options.repeatState ?? { sessions: {} },
    hook_state: options.hookState ?? { version: '0.0.1', projects: {} },
    last_event: entries.length ? lastEvent(entries.at(-1)) : null,
    recent,
    trace: recent,
  }
  ensureSchemaValid(result, schemaRefs.system('status'), 'status')
  return result
}

export function readStatus(options = {}) {
  return buildStatus(readLogTail({
    logPath: options.logPath,
    tail: options.tail ?? 1000,
  }), options)
}

function ruleCounts(entries) {
  return entries.reduce((counts, entry) => {
    const key = entry.fired_rule_id ?? 'none'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function lastEvent(entry) {
  return {
    trace_id: entry.trace_id,
    event_name: entry.event_name,
    fired_rule_id: entry.fired_rule_id ?? null,
    created_at: entry.created_at,
    duration_ms: entry.duration_ms,
  }
}

function recentRun(entry) {
  return {
    trace_id: entry.trace_id,
    event_name: entry.event_name,
    fired_rule_id: entry.fired_rule_id ?? null,
    duration_ms: entry.duration_ms,
    created_at: entry.created_at,
  }
}
