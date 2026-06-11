import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'
import { TOOLS_CATALOG } from './catalog.mjs'

export function validate(value = TOOLS_CATALOG) {
  return ensureSchemaValid(value, schemaRefs.system('tools'), 'tools')
}

export function list(options = {}) {
  const catalog = validate(options.catalog ?? TOOLS_CATALOG)
  return entries(catalog)
    .filter(entry => matches(entry, options))
    .map(({ id, group, tool }) => ({
      id,
      group,
      type: tool.type,
      status: tool.status,
      title: tool.value.title,
      adapters: tool.value.adapters,
      adapter_status: tool.value.adapter_status ?? {},
      methods: Object.keys(tool.method),
    }))
}

export function describe(id, options = {}) {
  if (!id) throw new TypeError('tool id is required')
  const catalog = validate(options.catalog ?? TOOLS_CATALOG)
  const found = entries(catalog).find(entry => entry.id === id || entry.tool.value.id === id)
  if (!found) throw new TypeError(`tool not found: ${id}`)
  return {
    id: found.id,
    group: found.group,
    ...found.tool,
  }
}

export function renderHelp(options = {}) {
  const adapter = options.adapter ?? 'cli'
  const rows = list({ ...options, adapter })
  const lines = [
    `codex-hooks tools for ${adapter}`,
    '',
    ...rows.map(row => `${row.id} [${row.type}/${row.status}] ${row.title}`),
  ]
  return `${lines.join('\n')}\n`
}

function entries(catalog) {
  const result = []
  for (const [group, tools] of Object.entries(catalog.tools)) {
    for (const [id, tool] of Object.entries(tools)) {
      result.push({ group, id, tool })
    }
  }
  return result
}

function matches(entry, options) {
  const { adapter, status, type } = options
  if (!status && entry.tool.status === 'hidden') return false
  if (status && entry.tool.status !== status) return false
  if (type && entry.tool.type !== type) return false
  if (adapter && !entry.tool.value.adapters.includes(adapter)) return false
  if (adapter && entry.tool.value.adapter_status?.[adapter] === 'hidden') return false
  return true
}
