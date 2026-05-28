import { query } from '../../../lib/bashjsast/src/index.mjs'
import { resolveInput } from '../../core/path.mjs'

export const name = 'bash-command'

export function inputPaths(config) {
  return collectPaths(config?.value)
}

export function evaluate(config, input) {
  return evaluateExpression(config?.value, input)
}

function evaluateExpression(expression, input) {
  if (!expression || typeof expression !== 'object') return false
  if (Array.isArray(expression.all)) return expression.all.every(item => evaluateExpression(item, input))
  if (Array.isArray(expression.any)) return expression.any.some(item => evaluateExpression(item, input))
  return evaluateMatcher(expression, input)
}

function evaluateMatcher(matcher, input) {
  const value = resolveInput(input, matcher.path)
  if (typeof value !== 'string' || value === '') return false
  const parsed = parseBash(value)
  if (!parsed) return false
  if (matcher.name !== undefined && !matchName(parsed, matcher.name)) return false
  if (matcher.arg !== undefined && !matchArg(parsed, matcher.arg)) return false
  if (matcher.flags !== undefined && !matchFlags(parsed, matcher.flags)) return false
  if (matcher.writes_to_file === true && !writesToFile(parsed)) return false
  return true
}

function matchName(parsed, spec) {
  const names = parsed.commands()
  if (typeof spec === 'string') return names.includes(spec)
  if (Array.isArray(spec?.in)) return names.some(name => spec.in.includes(name))
  if (typeof spec?.regex === 'string') {
    const re = new RegExp(spec.regex)
    return parsed.simpleCommands().some(cmd => cmd.name !== '' && re.test(cmd.name))
  }
  return false
}

function matchArg(parsed, spec) {
  const re = typeof spec.regex === 'string' ? new RegExp(spec.regex) : null
  return simpleCommands(parsed, spec.name).some(cmd => {
    if (typeof spec.contains === 'string' && cmd.args.some(arg => arg.includes(spec.contains))) return true
    return !!re && cmd.args.some(arg => re.test(arg))
  })
}

function matchFlags(parsed, spec) {
  const commands = simpleCommands(parsed, spec.name)
  if (Array.isArray(spec.contains)) {
    const mode = spec.mode ?? 'any'
    return commands.some(cmd => {
      const flags = new Set(cmd.flags ?? [])
      return mode === 'all' ? spec.contains.every(flag => flags.has(flag)) : spec.contains.some(flag => flags.has(flag))
    })
  }
  if (typeof spec.regex === 'string') {
    const re = new RegExp(spec.regex)
    return commands.some(cmd => (cmd.flags ?? []).some(flag => re.test(flag)))
  }
  return false
}

function writesToFile(parsed) {
  return parsed.simpleCommands().some(cmd => {
    if (['tee', 'dd'].includes(cmd.name)) return true
    return (cmd.writes ?? []).some(write => isFileContentWrite(write))
  })
}

function isFileContentWrite(write) {
  if (!write || write.target === '/dev/null') return false
  return write.fd === 1 || write.op === '&>' || write.op === '&>>'
}

function simpleCommands(parsed, name) {
  const commands = parsed.simpleCommands()
  return name ? commands.filter(cmd => cmd.name === name) : commands
}

function parseBash(command) {
  try {
    return query(command)
  } catch {
    return null
  }
}

function collectPaths(expression) {
  if (!expression || typeof expression !== 'object') return []
  if (Array.isArray(expression.all)) return expression.all.flatMap(collectPaths)
  if (Array.isArray(expression.any)) return expression.any.flatMap(collectPaths)
  return typeof expression.path === 'string' ? [expression.path] : []
}
