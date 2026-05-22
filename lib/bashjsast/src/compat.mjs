/**
 * Compatibility layer: bashjsast AST → unbash-compatible Command shape
 * Drop-in replacement for unbash in mcp-claude-hooks bash-parser.mjs
 *
 * unbash Command shape:
 *   { type: 'Command', name: {text}, prefix: [{text}], suffix: [{text}], redirects: [{operator, content}] }
 *
 * prefix = assignments before command name
 * suffix = args after command name (flags + positional)
 * redirects = redirect ops with target
 */

import { parse as bashjsParse } from './parser.mjs'

export function parse(command, opts = {}) {
  if (!command || typeof command !== 'string') return emptyResult()
  command = command.trim()
  if (!command) return emptyResult()

  try {
    const ast = bashjsParse(command, opts.partial ? { partial: true } : undefined)
    const commands = []
    if (ast.partial) {
      // Filter out ParseError nodes from partial parse
      for (const node of (ast.commands || [])) {
        if (node.type === 'ParseError') continue
        flattenNode(node, commands)
      }
    } else {
      flattenNode(ast, commands)
    }
    const result = { type: 'simple', commands, raw: command }
    if (ast.partial) result.partial = true
    return result
  } catch {
    return { type: 'error', commands: [], raw: command }
  }
}

const TOP_CTX = { parent: 'Script', branch: 'top', depth: 0, pipePosition: null }

function flattenNode(node, commands, ctx = TOP_CTX) {
  if (!node) return
  const nest = (parent, branch) => ({ parent, branch, depth: ctx.depth + 1, pipePosition: null })
  switch (node.type) {
    case 'Script':
      node.commands?.forEach(c => flattenNode(c, commands, ctx)); break
    case 'SimpleCommand':
      commands.push(toCommand(node, ctx)); break
    case 'Pipeline':
      node.commands?.forEach((c, i) => {
        const pCtx = { parent: 'Pipeline', branch: 'pipe', depth: ctx.depth + 1, pipePosition: i }
        flattenNode(c, commands, pCtx)
      }); break
    case 'List':
      flattenNode(node.left, commands, ctx); flattenNode(node.right, commands, ctx); break
    case 'If':
      flattenNode(node.test, commands, nest('If', 'test'))
      flattenNode(node.body, commands, nest('If', 'body'))
      flattenNode(node.alternate, commands, nest('If', 'alternate')); break
    case 'While': case 'Until':
      flattenNode(node.test, commands, nest(node.type, 'test'))
      flattenNode(node.body, commands, nest(node.type, 'body')); break
    case 'For': case 'Select':
      flattenNode(node.body, commands, nest(node.type, 'body')); break
    case 'Case':
      node.clauses?.forEach(c => flattenNode(c.body, commands, nest('Case', 'body'))); break
    case 'Group': case 'Subshell':
      flattenNode(node.body, commands, nest(node.type, 'body')); break
    case 'Function':
      flattenNode(node.body, commands, nest('Function', 'body')); break
    case 'Coproc':
      flattenNode(node.body, commands, nest('Coproc', 'body')); break
    case 'Arithmetic':
      commands.push({
        type: 'Command',
        name: { text: '((' },
        prefix: [],
        suffix: [{ text: node.expression.text }, { text: '))' }],
        redirects: toRedirects(node.redirects),
        context: ctx
      }); break
    case 'Condition':
      commands.push({
        type: 'Command',
        name: { text: '[[' },
        prefix: [],
        suffix: [...conditionWords(node), { text: ']]' }],
        redirects: [],
        context: ctx
      }); break
  }
}

function toCommand(node, ctx) {
  const prefix = (node.assignments || []).map(a => {
    const op = a.append ? '+=' : '='
    const rhs = a.rhs?.text ?? ''
    return { text: `${a.name}${op}${rhs}` }
  })

  const suffix = (node.args || []).map(a => ({ text: a.text }))

  return {
    type: 'Command',
    name: node.name ? { text: node.name.text } : undefined,
    prefix,
    suffix,
    redirects: toRedirects(node.redirects),
    context: ctx
  }
}

function toRedirects(redirects) {
  if (!redirects?.length) return []
  return redirects.map(r => ({
    operator: r.op,
    content: r.target?.text ?? ''
  }))
}

function conditionWords(node) {
  if (!node) return []
  switch (node.condType) {
    case 'and':
      return [...conditionWords(node.left), { text: '&&' }, ...conditionWords(node.right)]
    case 'or':
      return [...conditionWords(node.left), { text: '||' }, ...conditionWords(node.right)]
    case 'unary':
      return [{ text: node.op.text }, ...conditionWords(node.left)]
    case 'binary':
      return [...conditionWords(node.left), { text: node.op.text }, ...conditionWords(node.right)]
    case 'term':
      return [{ text: node.op.text }]
    case 'expr':
      return [{ text: '(' }, ...conditionWords(node.left), { text: ')' }]
    default:
      return node.op ? [{ text: node.op.text }] : []
  }
}

function emptyResult() {
  return { type: 'simple', commands: [], raw: '' }
}
