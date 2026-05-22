import fs from 'node:fs'
import path from 'node:path'
import { validate } from '../../lib/schema2object/schema2object.mjs'
import { ROOT, ensureSchemaValid, readJson, resolveSchema, rootPath, schemaRefs } from './schema-tree.mjs'
import { validateRuleTransition } from './transition.mjs'

const CONFIG_SEARCH = ['.codex-hooks.json', '.codex/codex-hooks.json']

export { readJson, rootPath } from './schema-tree.mjs'

export function ensureValid(data, schema, label = 'data') {
  const result = validate(data, schema)
  if (result.valid) return data
  const details = result.errors?.length ? result.errors.join('; ') : result.error
  throw new TypeError(`${label}: ${details}`)
}

export function loadOfficialSchema(eventName, direction) {
  const ref = direction === 'input' ? schemaRefs.eventInput(eventName) : schemaRefs.eventOutput(eventName)
  const { node } = resolveSchema(ref)
  return node
}

export function readProfile(relativePath) {
  const data = readJson(relativePath)
  ensureSchemaValid(data, schemaRefs.system('profile'), relativePath)
  return data
}

export function loadConfig(explicitPath) {
  const file = resolveConfigPath(explicitPath)
  if (!file) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  ensureSchemaValid(raw, schemaRefs.system('config'), file)
  return raw
}

function resolveConfigPath(explicitPath) {
  if (explicitPath) {
    const abs = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(process.cwd(), explicitPath)
    if (!fs.existsSync(abs)) throw new TypeError(`config not found: ${explicitPath}`)
    return abs
  }
  const env = process.env.CODEX_HOOKS_CONFIG
  if (env && fs.existsSync(env)) return env
  for (const candidate of CONFIG_SEARCH) {
    const cwdCandidate = path.resolve(process.cwd(), candidate)
    if (fs.existsSync(cwdCandidate)) return cwdCandidate
  }
  const home = process.env.HOME ? path.join(process.env.HOME, '.codex', 'codex-hooks.json') : null
  if (home && fs.existsSync(home)) return home
  return null
}

export function listRuleFiles(rulesRoot) {
  const root = rootPath(rulesRoot)
  try {
    return walk(root)
      .filter(file => file.endsWith('.rule.json'))
      .map(file => path.relative(ROOT, file))
      .sort()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

export function loadRules({ rulesRoot, profilePath } = {}) {
  const root = rulesRoot ?? 'policy/rules'
  const profile = profilePath ? compileProfile(profilePath) : defaultProfile()
  const files = listRuleFiles(root)
  const rules = files
    .filter(file => profileSelects(profile, root, file))
    .map(file => {
      const data = readJson(file)
      if (!data.event) throw new TypeError(`${file}: missing event`)
      ensureSchemaValid(data, schemaRefs.eventRule(data.event), file)
      const rule = applyOverlay(data, profile, root, file)
      const { node: inputSchema } = resolveSchema(schemaRefs.eventInput(rule.event))
      validateRuleTransition(rule, { sduSchema: inputSchema, label: file })
      ensureSchemaValid(rule.output, schemaRefs.eventOutput(rule.event), `${file}.output`)
      return rule
    })
  return { version: profile.version ?? '0.0.0', profile_id: profile.id, rules: sortRules(rules) }
}

function compileProfile(profilePath) {
  const profile = readProfile(profilePath)
  if (!profile.extends) return profile
  const parentPath = resolveProfilePath(profilePath, profile.extends)
  const parent = compileProfile(parentPath)
  return mergeProfile(parent, profile)
}

function resolveProfilePath(basePath, name) {
  const dir = path.dirname(basePath)
  return path.join(dir, `${name}.profile.json`)
}

function mergeProfile(parent, child) {
  return {
    version: child.version ?? parent.version,
    id: child.id,
    enabled: child.enabled ?? parent.enabled,
    rules: child.rules?.length ? child.rules : parent.rules,
    overrides: {
      by_id: { ...(parent.overrides?.by_id ?? {}), ...(child.overrides?.by_id ?? {}) },
      by_tag: { ...(parent.overrides?.by_tag ?? {}), ...(child.overrides?.by_tag ?? {}) },
    },
    defaults: { ...(parent.defaults ?? {}), ...(child.defaults ?? {}) },
  }
}

function defaultProfile() {
  return { version: '0.0.0', id: 'default', rules: ['*/*.rule.json'], overrides: { by_id: {}, by_tag: {} }, defaults: {} }
}

function profileSelects(profile, rulesRoot, file) {
  if (profile.enabled === false) return false
  const relative = path.relative(rulesRoot, file).split(path.sep).join('/')
  const selectors = profile.rules?.length ? profile.rules : ['*/*.rule.json']
  return selectors.some(selector => globMatch(selector, relative))
}

const GLOB_CACHE = new Map()

function globMatch(pattern, value) {
  let re = GLOB_CACHE.get(pattern)
  if (!re) {
    const escaped = pattern.split('*').map(part => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    re = new RegExp(`^${escaped.join('.*')}$`)
    GLOB_CACHE.set(pattern, re)
  }
  return re.test(value)
}

function applyOverlay(rule, profile, rulesRoot, file) {
  const overlays = []
  if (profile.defaults) overlays.push(profile.defaults)
  const byTag = profile.overrides?.by_tag ?? {}
  for (const tag of rule.tags ?? []) {
    if (byTag[tag]) overlays.push(byTag[tag])
  }
  const byId = profile.overrides?.by_id ?? {}
  if (byId[rule.id]) overlays.push(byId[rule.id])
  return overlays.reduce((acc, overlay) => mergeRule(acc, overlay), rule)
}

function mergeRule(rule, overlay) {
  return {
    ...rule,
    ...overlay,
    tags: overlay.tags ? Array.from(new Set([...(rule.tags ?? []), ...overlay.tags])) : rule.tags,
  }
}

function sortRules(rules) {
  return [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id))
}

function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) return walk(file)
    return entry.isFile() ? [file] : []
  })
}
