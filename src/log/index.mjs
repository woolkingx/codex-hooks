import fs from 'node:fs'
import path from 'node:path'
import { toErrorPDU } from '../core/errors.mjs'
import { ensureSchemaValid } from '../core/schema-tree.mjs'

const DEFAULT_REDACTION_PATTERNS = Object.freeze([
  'sk-[A-Za-z0-9_-]+',
  '(?i)(api[_-]?key|token|secret|password)',
])

export function buildLogRecord(input, eventName, eventId, firedRuleId, output, meta = {}) {
  const error = meta.errorPDU ?? (meta.error ? toErrorPDU(meta.error, meta.errorLayer ?? 'executor') : null)
  return {
    trace_id: meta.traceId ?? makeTraceId(),
    event_id: eventId ?? '',
    event_name: eventName ?? 'unknown',
    fired_rule_id: firedRuleId ?? null,
    duration_ms: meta.durationMs ?? 0,
    created_at: meta.createdAt ?? new Date().toISOString(),
    input: redact(input, meta.redactionPatterns),
    output: output ?? null,
    error,
  }
}

export function appendLog(record, options = {}) {
  if (!options.logPath) throw new TypeError('logPath is required')
  ensureSchemaValid(record, 'log.schema.json#/definitions/log_entry', 'log_entry')
  fs.mkdirSync(path.dirname(options.logPath), { recursive: true })
  fs.appendFileSync(options.logPath, `${JSON.stringify(record)}\n`)
  return record
}

export function readLogTail(options = {}) {
  if (!options.logPath) throw new TypeError('logPath is required')
  if (!fs.existsSync(options.logPath)) return []
  const tail = Number.isInteger(options.tail) ? options.tail : Number(options.tail ?? 20)
  const lines = fs.readFileSync(options.logPath, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-Math.max(0, tail)).map(line => JSON.parse(line))
}

export function redact(value, patterns = DEFAULT_REDACTION_PATTERNS) {
  return redactNode(value, compilePatterns(patterns))
}

function redactNode(value, patterns) {
  if (Array.isArray(value)) return value.map(item => redactNode(item, patterns))
  if (value && typeof value === 'object') return redactObject(value, patterns)
  if (typeof value === 'string') return redactString(value, patterns)
  return value
}

function redactObject(value, patterns) {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (isSensitiveKey(key, patterns)) return [key, '[REDACTED]']
    return [key, redactNode(child, patterns)]
  }))
}

function redactString(value, patterns) {
  return patterns.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value)
}

function isSensitiveKey(key, patterns) {
  return patterns.some(pattern => pattern.test(key))
}

function compilePatterns(patterns) {
  return patterns.map(pattern => {
    const flags = pattern.startsWith('(?i)') ? 'gi' : 'g'
    const source = pattern.startsWith('(?i)') ? pattern.slice(4) : pattern
    return new RegExp(source, flags)
  })
}

function makeTraceId() {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
