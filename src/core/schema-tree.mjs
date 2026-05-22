import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Loader, ObjectTree, validate } from '../../lib/schema2object/schema2object.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const ROOT_SCHEMA_PATH = 'schema/codex-hooks.schema.json'

export const schemaRefs = Object.freeze({
  eventInput: event => `api/openai-codex/generated/${event}.command.input.schema.json#`,
  eventOutput: event => `api/openai-codex/generated/${event}.command.output.schema.json#`,
  eventRule: event => `../src/events/${event}/${event}.rule.schema.json#`,
  feature: name => `../src/features/${name}/schema.json#`,
  system: name => `${name}.schema.json#`,
  userPolicy: () => 'user-policy.schema.json#',
})

let ROOT_LOADER = null

export function rootPath(...segments) {
  if (segments.length === 1 && path.isAbsolute(segments[0])) return segments[0]
  return path.join(ROOT, ...segments)
}

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(rootPath(relativePath), 'utf8'))
}

export function rootLoader() {
  if (!ROOT_LOADER) ROOT_LOADER = new Loader(readJson(ROOT_SCHEMA_PATH), schemaResolver, rootPath('schema'))
  return ROOT_LOADER
}

export function resetRootLoaderForTests() {
  ROOT_LOADER = null
}

export function resolveSchema(ref) {
  return rootLoader().resolve(ref)
}

export function bindObject(data, ref, label = ref) {
  const { node, loader } = resolveSchema(ref)
  try {
    return new ObjectTree(data, node, loader)
  } catch (error) {
    throw new TypeError(`${label}: ${error.message}`)
  }
}

export function ensureSchemaValid(data, ref, label = ref) {
  const { node, loader } = resolveSchema(ref)
  const result = validate(data, node, loader)
  if (result.valid) return data
  const details = result.errors?.length ? result.errors.join('; ') : result.error
  throw new TypeError(`${label}: ${details}`)
}

export function stripDefaults(node) {
  if (Array.isArray(node)) return node.map(stripDefaults)
  if (!node || typeof node !== 'object') return node
  const copy = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'default') continue
    copy[key] = stripDefaults(value)
  }
  return copy
}

function schemaResolver(uri) {
  const schema = JSON.parse(fs.readFileSync(path.resolve(rootPath('schema'), uri), 'utf8'))
  return uri.startsWith('api/openai-codex/generated/') ? stripDefaults(schema) : schema
}
