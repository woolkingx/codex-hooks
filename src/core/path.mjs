export function resolveInput(input, inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.startsWith('$')) {
    throw new TypeError(`input-path-invalid: ${inputPath}`)
  }
  const segments = parsePath(inputPath)
  let current = input
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new TypeError(`input-path-not-resolvable: ${inputPath}`)
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new TypeError(`input-path-not-resolvable: ${inputPath}`)
    }
    current = current[segment]
  }
  return current
}

export function validateInputPath(inputPath, sduSchema, nodePath) {
  if (!sduSchema) return
  if (typeof inputPath !== 'string' || !inputPath.startsWith('$')) {
    const err = new TypeError(`rule-transition-invalid: read path must start with $ at ${nodePath}`)
    err.code = 'rule-transition-invalid'
    throw err
  }
  let segments
  try {
    segments = parsePath(inputPath)
  } catch {
    const err = new TypeError(`rule-transition-invalid: malformed read path "${inputPath}" at ${nodePath}`)
    err.code = 'rule-transition-invalid'
    throw err
  }
  let schema = sduSchema
  for (const segment of segments) {
    if (schemaAllowsAny(schema)) return
    if (schema && typeof schema === 'object') {
      if (schema.properties?.[segment]) {
        schema = schema.properties[segment]
        continue
      }
      if (schema.items && /^\d+$/.test(String(segment))) {
        schema = schema.items
        continue
      }
      if (schema.additionalProperties === true || schema.type === undefined) return
    }
    const err = new TypeError(`rule-transition-invalid: read path "${inputPath}" not found in input schema at ${nodePath}`)
    err.code = 'rule-transition-invalid'
    throw err
  }
}

function schemaAllowsAny(schema) {
  if (schema === true) return true
  if (!schema || typeof schema !== 'object') return false
  if (Object.keys(schema).length === 0) return true
  return schema.additionalProperties === true && !schema.properties
}

function parsePath(inputPath) {
  const body = inputPath.slice(1)
  if (!body || body === '.') return []
  const segments = []
  let index = 0
  while (index < body.length) {
    const dot = /^\.([^.[]+)/.exec(body.slice(index))
    if (dot) {
      segments.push(dot[1])
      index += dot[0].length
      continue
    }
    const arrayIndex = /^\[(\d+)\]/.exec(body.slice(index))
    if (arrayIndex) {
      segments.push(Number(arrayIndex[1]))
      index += arrayIndex[0].length
      continue
    }
    throw new TypeError(`input-path-invalid: ${inputPath}`)
  }
  return segments
}
