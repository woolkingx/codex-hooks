/**
 * Bash AST Printer — canonical text output
 * Port of bash's print_cmd.c logic.
 * Input: plain object from $toDict(), NOT ObjectTree.
 * Output: string matching `bash -c 'f(){ ...; }; type f'` format.
 */

const INDENT_SIZE = 4
let _strict = false

// ─── Redirect printing ──────────────────────────────────────────────────────

// Default fd for each redirect op (matches bash's defaults)
const DEFAULT_FD = {
  '>': 1, '>>': 1, '>|': 1, '>&': 1,
  '<': 0, '<<': 0, '<<<': 0, '<&': 0, '<<-': 0, '<>': 0,
  '&>': -1, '&>>': -1,  // no fd prefix
}

function printRedirect(r) {
  const op = r.op
  const target = r.target?.text ?? ''
  const defaultFd = DEFAULT_FD[op]

  // &> and &>> never print fd
  if (op === '&>' || op === '&>>') return `${op} ${target}`

  // >& (dup output) — omit fd if 1
  if (op === '>&') {
    return r.fd === 1 ? `>&${target}` : `${r.fd}>&${target}`
  }
  // <& (dup input) — omit fd if 0
  if (op === '<&') {
    return r.fd === 0 ? `<&${target}` : `${r.fd}<&${target}`
  }

  // Standard redirects — omit fd if it matches the default
  const fdStr = (r.fd !== undefined && r.fd !== defaultFd) ? String(r.fd) : ''
  // Heredoc ops: no space between op and delimiter
  if (op === '<<' || op === '<<-') {
    return `${fdStr}${op}${target}`
  }
  // Space between op and target for most redirects
  return `${fdStr}${op} ${target}`
}

function printRedirects(redirects) {
  if (!redirects?.length) return ''
  return redirects.map(printRedirect).join(' ')
}

function collectHeredocBodies(redirects) {
  if (!redirects?.length) return ''
  let result = ''
  for (const r of redirects) {
    if (r.hereDoc !== undefined) {
      result += '\n' + r.hereDoc + r.hereDocEnd + '\n'
    }
  }
  return result
}

// ─── Node printers ──────────────────────────────────────────────────────────

function printNode(node, indent, insideFunc) {
  if (!node) return ''
  switch (node.type) {
    case 'SimpleCommand': return printSimpleCommand(node)
    case 'Pipeline': return printPipeline(node, indent, insideFunc)
    case 'List': return printList(node, indent, insideFunc)
    case 'If': return printIf(node, indent, insideFunc)
    case 'While': return printWhileUntil(node, 'while', indent, insideFunc)
    case 'Until': return printWhileUntil(node, 'until', indent, insideFunc)
    case 'For': return printFor(node, indent, insideFunc)
    case 'Select': return printSelect(node, indent, insideFunc)
    case 'Case': return printCase(node, indent, insideFunc)
    case 'Group': return printGroup(node, indent, insideFunc)
    case 'Subshell': return printSubshell(node, indent, insideFunc)
    case 'Arithmetic': return printArithmetic(node)
    case 'Condition': return printCondition(node)
    case 'Coproc': return printCoproc(node, indent, insideFunc)
    case 'Function': return printFunction(node, indent)
    default:
      if (_strict) throw new Error(`Unknown AST node type: ${node.type}`)
      return `/* unknown: ${node.type} */`
  }
}

function printSimpleCommand(node) {
  const parts = []

  // Assignments before command name
  if (node.assignments?.length) {
    for (const a of node.assignments) {
      const op = a.append ? '+=' : '='
      const rhs = a.rhs?.text ?? ''
      parts.push(`${a.name}${op}${rhs}`)
    }
  }

  // Command name + args
  if (node.name) {
    parts.push(node.name.text)
    if (node.args?.length) {
      for (const arg of node.args) parts.push(arg.text)
    }
  }

  let result = parts.join(' ')

  // Redirects
  if (node.redirects?.length) {
    if (result) result += ' '
    result += printRedirects(node.redirects)
    result += collectHeredocBodies(node.redirects)
  }

  return result
}

function printPipeline(node, indent, insideFunc) {
  let result = ''
  if (node.negated) result += '! '
  const cmds = node.commands.map(c => printNode(c, indent, insideFunc))
  result += cmds.join(' | ')
  if (node.redirects?.length) result += ' ' + printRedirects(node.redirects)
  return result
}

function printList(node, indent, insideFunc) {
  const left = printNode(node.left, indent, insideFunc)
  const right = printNode(node.right, indent, insideFunc)
  const op = node.op

  if (op === ';') {
    if (insideFunc) {
      return left + ';\n' + pad(indent) + right
    }
    return left + '; ' + right
  }
  return `${left} ${op} ${right}`
}

// ─── Compound commands ──────────────────────────────────────────────────────

function printIf(node, indent, insideFunc) {
  let s = 'if '
  s += printNode(node.test, indent, insideFunc)
  s += '; then\n'
  s += pad(indent + INDENT_SIZE) + printBody(node.body, indent + INDENT_SIZE, insideFunc)

  if (node.alternate) {
    s += ';\n'
    if (node.alternate.type === 'If') {
      // elif — bash prints as else + nested if
      s += pad(indent) + 'else\n'
      s += pad(indent + INDENT_SIZE) + printNode(node.alternate, indent + INDENT_SIZE, insideFunc) + ';\n'
      s += pad(indent) + 'fi'
    } else {
      s += pad(indent) + 'else\n'
      s += pad(indent + INDENT_SIZE) + printBody(node.alternate, indent + INDENT_SIZE, insideFunc)
      s += ';\n'
      s += pad(indent) + 'fi'
    }
  } else {
    s += ';\n'
    s += pad(indent) + 'fi'
  }
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printWhileUntil(node, keyword, indent, insideFunc) {
  let s = `${keyword} `
  s += printNode(node.test, indent, insideFunc)
  s += '; do\n'
  s += pad(indent + INDENT_SIZE) + printBody(node.body, indent + INDENT_SIZE, insideFunc)
  s += ';\n'
  s += pad(indent) + 'done'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printFor(node, indent, insideFunc) {
  const isArithFor = node.name.text.startsWith('((')
  let s
  if (isArithFor) {
    // Arithmetic for: for ((init; test; step))
    s = `for ${node.name.text}\n`
    s += pad(indent) + 'do\n'
  } else {
    s = `for ${node.name.text}`
    if (node.items) {
      s += ' in ' + node.items.map(w => w.text).join(' ')
    } else {
      // bash expands bare `for i` to `for i in "$@"`
      s += ' in "$@"'
    }
    s += ';\n'
    s += pad(indent) + 'do\n'
  }
  s += pad(indent + INDENT_SIZE) + printBody(node.body, indent + INDENT_SIZE, insideFunc)
  s += ';\n'
  s += pad(indent) + 'done'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printArithmetic(node) {
  let s = `(( ${node.expression.text} ))`
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printCondition(node) {
  return '[[ ' + printCondInner(node) + ' ]]'
}

function printCondInner(node) {
  switch (node.condType) {
    case 'and':
      return printCondInner(node.left) + ' && ' + printCondInner(node.right)
    case 'or':
      return printCondInner(node.left) + ' || ' + printCondInner(node.right)
    case 'unary':
      if (node.op.text === '!') return '! ' + printCondInner(node.left)
      return node.op.text + ' ' + printCondInner(node.left)
    case 'binary':
      return printCondInner(node.left) + ' ' + node.op.text + ' ' + printCondInner(node.right)
    case 'term':
      return node.op.text
    case 'expr':
      return '( ' + printCondInner(node.left) + ' )'
    default:
      return node.op?.text ?? ''
  }
}

function printCoproc(node, indent, insideFunc) {
  let s = 'coproc '
  const name = node.name || 'COPROC'
  s += name + ' '
  if (name !== 'COPROC') {
    // Named coproc with compound body prints in function-like style
    s += printNode(node.body, indent, true)
  } else {
    s += printNode(node.body, indent, insideFunc)
  }
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printSelect(node, indent, insideFunc) {
  let s = `select ${node.name.text}`
  if (node.items) {
    s += ' in ' + node.items.map(w => w.text).join(' ')
  } else {
    s += ' in "$@"'
  }
  s += ';\n'
  s += pad(indent) + 'do\n'
  s += pad(indent + INDENT_SIZE) + printBody(node.body, indent + INDENT_SIZE, insideFunc)
  s += ';\n'
  s += pad(indent) + 'done'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printCase(node, indent, insideFunc) {
  let s = `case ${node.word.text} in \n`
  if (node.clauses?.length) {
    for (const clause of node.clauses) {
      s += pad(indent + INDENT_SIZE)
      s += clause.patterns.map(p => p.text).join(' | ')
      s += ')\n'
      if (clause.body) {
        s += pad(indent + INDENT_SIZE * 2)
        s += printBody(clause.body, indent + INDENT_SIZE * 2, insideFunc)
        s += '\n'
      }
      s += pad(indent + INDENT_SIZE)
      s += (clause.terminator || ';;') + '\n'
    }
  }
  s += pad(indent) + 'esac'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printGroup(node, indent, insideFunc) {
  if (insideFunc) {
    let s = '{ \n'
    s += pad(indent + INDENT_SIZE) + printBody(node.body, indent + INDENT_SIZE, true)
    s += '\n'
    s += pad(indent) + '}'
    if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
    return s
  }
  let s = '{ '
  s += printNode(node.body, indent, insideFunc)
  s += '; }'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printSubshell(node, indent, insideFunc) {
  let s = '( '
  s += printNode(node.body, indent, insideFunc)
  s += ' )'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

function printFunction(node, indent) {
  // bash `type` always prints: NAME () \n{ \n    BODY\n}
  let s = `${node.name.text} () \n`
  s += pad(indent) + '{ \n'
  const bodyIndent = indent + INDENT_SIZE
  const body = node.body
  // Function body is typically a Group — unwrap it
  const innerBody = body.type === 'Group' ? body.body : body
  s += pad(bodyIndent) + printBody(innerBody, bodyIndent, true)
  s += '\n'
  s += pad(indent) + '}'
  if (node.redirects?.length) s += ' ' + printRedirects(node.redirects)
  return s
}

// ─── Body: may be a single command or a List chain ──────────────────────────

function printBody(node, indent, insideFunc) {
  if (!node) return ''
  // If it's a List with ';' op, it represents multiple statements
  if (node.type === 'List' && node.op === ';') {
    return flattenSemiList(node)
      .map(c => printNode(c, indent, insideFunc))
      .join(';\n' + pad(indent))
  }
  return printNode(node, indent, insideFunc)
}

// Flatten left-heavy ; chains into array
function flattenSemiList(node) {
  const result = []
  let cur = node
  while (cur && cur.type === 'List' && cur.op === ';') {
    result.push(cur.right)
    cur = cur.left
  }
  if (cur) result.push(cur)
  result.reverse()
  return result
}

// ─── Script-level printing ──────────────────────────────────────────────────

function printScript(script) {
  if (!script?.commands?.length) return ''
  return script.commands.map(c => printNode(c, 0, false)).join(';\n')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(n) {
  return ' '.repeat(n)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Print AST (from $toDict()) as canonical bash text.
 * @param {object} ast - Script node from parse(src).$toDict()
 * @returns {string}
 */
export function print(ast, opts = {}) {
  if (opts.strict) _strict = true
  try {
    if (ast.type === 'Script') return printScript(ast)
    return printNode(ast, 0, false)
  } finally {
    _strict = false
  }
}

/**
 * Print AST in function-def format (matching `type f` output).
 * @param {string} name - function name
 * @param {object} ast - Script node
 * @returns {string}
 */
export function printAsFunction(name, ast) {
  // Wrap script body in function format matching `type` output
  const commands = ast.type === 'Script' ? ast.commands : [ast]
  let s = `${name} is a function\n`
  s += `${name} () \n`
  s += '{ \n'
  const indent = INDENT_SIZE
  for (let i = 0; i < commands.length; i++) {
    s += pad(indent) + printNode(commands[i], indent, true)
    if (i < commands.length - 1) s += ';\n'
  }
  s += '\n}'
  return s
}
