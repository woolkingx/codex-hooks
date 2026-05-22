/**
 * Bash Parser
 * Token stream → plain dict AST
 * Zero dependencies beyond lexer. Schema validation is opt-in via ObjectTree.
 */

import { Lexer, T } from './lexer.mjs'

// ─── AST Factory ─────────────────────────────────────────────────────────────

function makeWord(text, pos) {
  return { type: 'Word', text, pos }
}

function makeAssignment(name, rhs, append, pos) {
  const data = { type: 'Assignment', name, pos }
  if (rhs !== undefined) data.rhs = rhs
  if (append) data.append = true
  return data
}

function makeRedirect(op, fd, target, pos) {
  const data = { type: 'Redirect', op, pos }
  if (fd !== undefined) data.fd = fd
  if (target) data.target = target
  return data
}

function makeSimpleCommand(name, args, assignments, redirects, pos) {
  const data = { type: 'SimpleCommand' }
  if (name) data.name = name
  if (args.length) data.args = args
  if (assignments.length) data.assignments = assignments
  if (redirects.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makePipeline(commands, negated, pos) {
  const data = { type: 'Pipeline', commands, pos }
  if (negated) data.negated = true
  return data
}

function makeList(left, right, op, pos) {
  return { type: 'List', left, right, op, pos }
}

function makeIf(test, body, alternate, redirects, pos) {
  const data = { type: 'If', test, body }
  if (alternate) data.alternate = alternate
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeWhileUntil(type, test, body, redirects, pos) {
  const data = { type, test, body }
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeFor(name, items, body, redirects, pos) {
  const data = { type: 'For', name, body }
  if (items) data.items = items
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeArithmetic(expr, redirects, pos) {
  const data = { type: 'Arithmetic', expression: expr }
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeCoproc(name, body, redirects, pos) {
  const data = { type: 'Coproc', body }
  if (name) data.name = name
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeCondition(condType, op, left, right, pos) {
  const data = { type: 'Condition', condType }
  if (op) data.op = op
  if (left) data.left = left
  if (right) data.right = right
  if (pos) data.pos = pos
  return data
}

function makeSelect(name, items, body, redirects, pos) {
  const data = { type: 'Select', name, body }
  if (items) data.items = items
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeGroup(body, redirects, pos) {
  const data = { type: 'Group', body }
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeSubshell(body, redirects, pos) {
  const data = { type: 'Subshell', body }
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeCase(word, clauses, redirects, pos) {
  const data = { type: 'Case', word }
  if (clauses?.length) data.clauses = clauses
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeCaseItem(patterns, body, terminator, pos) {
  const data = { type: 'CaseItem', patterns }
  if (body) data.body = body
  if (terminator) data.terminator = terminator
  if (pos) data.pos = pos
  return data
}

function makeFunction(name, body, hasKeyword, redirects, pos) {
  const data = { type: 'Function', name, body }
  if (hasKeyword) data.hasKeyword = true
  if (redirects?.length) data.redirects = redirects
  if (pos) data.pos = pos
  return data
}

function makeScript(commands, comments, pos) {
  const data = { type: 'Script', commands }
  if (comments?.length) data.comments = comments
  return data
}

// ─── Redirect operator mapping ───────────────────────────────────────────────

const REDIR_OPS = {
  [T.GREAT]: '>',
  [T.LESS]: '<',
  [T.GREATER_GREATER]: '>>',
  [T.LESS_LESS]: '<<',
  [T.LESS_AND]: '<&',
  [T.GREATER_AND]: '>&',
  [T.LESS_LESS_MINUS]: '<<-',
  [T.LESS_LESS_LESS]: '<<<',
  [T.AND_GREATER]: '&>',
  [T.AND_GREATER_GREATER]: '&>>',
  [T.LESS_GREATER]: '<>',
  [T.GREATER_BAR]: '>|',
}

function isRedirToken(type) {
  return type in REDIR_OPS
}

function defaultFd(op) {
  if (op.startsWith('<') || op === '<>' || op === '<&') return 0
  return 1
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  #tokens
  #pos
  #comments
  #heredocBodies

  constructor(tokens) {
    this.#tokens = tokens
    this.#pos = 0
    this.#comments = []
    this.#heredocBodies = []
  }

  #peek() { return this.#tokens[this.#pos] }
  #peekType() { return this.#tokens[this.#pos]?.type }

  #eat(type) {
    const tok = this.#peek()
    if (!tok || tok.type !== type) {
      const found = tok ? `${tok.type}(${tok.value})` : 'EOF'
      throw new SyntaxError(`Expected ${type}, got ${found} at line ${tok?.pos?.line}:${tok?.pos?.column}`)
    }
    this.#pos++
    return tok
  }

  #match(type) {
    if (this.#peekType() === type) { this.#pos++; return true }
    return false
  }

  #skipNewlines() {
    while (this.#peekType() === T.NEWLINE || this.#peekType() === T.HEREDOC_BODY) this.#pos++
  }

  // ─── Entry ───

  parse() {
    const commands = []
    this.#skipNewlines()

    while (this.#peekType() !== T.EOF) {
      const posBefore = this.#pos
      const cmd = this.#parseList()
      if (cmd) commands.push(cmd)
      // Safety: if nothing was consumed, skip the token to avoid infinite loop
      if (this.#pos === posBefore) {
        this.#pos++
        continue
      }

      // Consume separators
      while (this.#peekType() === T.SEMI || this.#peekType() === T.AMP || this.#peekType() === T.NEWLINE) {
        const sepTok = this.#peek()
        this.#pos++
        // & makes the command async — wrap in List with & op
        if (sepTok.type === T.AMP && commands.length > 0) {
          const last = commands.pop()
          // Create a List node for async, with a no-op right side
          // Actually, & just backgrounds the command. We'll annotate it differently.
          // For now, re-push as-is. Phase 2 will handle this properly.
          commands.push(last)
        }
      }
      this.#skipNewlines()
    }

    return makeScript(commands, this.#comments.length ? this.#comments : undefined)
  }

  /** Partial parse: returns successfully parsed commands + error marker on failure */
  parsePartial() {
    const commands = []
    this.#skipNewlines()

    while (this.#peekType() !== T.EOF) {
      const posBefore = this.#pos
      try {
        const cmd = this.#parseList()
        if (cmd) commands.push(cmd)
        if (this.#pos === posBefore) { this.#pos++; continue }
      } catch (e) {
        const tok = this.#peek()
        commands.push({
          type: 'ParseError',
          message: e.message,
          pos: tok?.pos ?? { line: 0, column: 0, offset: this.#pos },
        })
        break
      }

      while (this.#peekType() === T.SEMI || this.#peekType() === T.AMP || this.#peekType() === T.NEWLINE) {
        const sepTok = this.#peek()
        this.#pos++
        if (sepTok.type === T.AMP && commands.length > 0) {
          const last = commands.pop()
          commands.push(last)
        }
      }
      this.#skipNewlines()
    }

    const script = makeScript(commands, this.#comments.length ? this.#comments : undefined)
    script.partial = commands.some(c => c.type === 'ParseError')
    return script
  }

  // ─── List: cmd && cmd || cmd ───

  #parseList() {
    let left = this.#parsePipeline()
    if (!left) return null

    while (true) {
      const t = this.#peekType()
      if (t === T.AND_AND || t === T.OR_OR) {
        const opTok = this.#peek()
        const op = opTok.value
        this.#pos++
        this.#skipNewlines()
        const right = this.#parsePipeline()
        if (!right) throw new SyntaxError(`Expected command after ${op} at line ${opTok.pos.line}`)
        left = makeList(left, right, op, opTok.pos)
      } else {
        break
      }
    }
    return left
  }

  // ─── Pipeline: [!] cmd | cmd ───

  #parsePipeline() {
    let negated = false
    let bangPos
    if (this.#peekType() === T.BANG) {
      bangPos = this.#peek().pos
      negated = true
      this.#pos++
    }

    const first = this.#parseCommand()
    if (!first) {
      if (negated) throw new SyntaxError(`Expected command after ! at line ${bangPos.line}`)
      return null
    }

    const commands = [first]
    while (this.#peekType() === T.PIPE || this.#peekType() === T.BAR_AND) {
      this.#pos++
      this.#skipNewlines()
      const next = this.#parseCommand()
      if (!next) throw new SyntaxError('Expected command after |')
      commands.push(next)
    }

    if (commands.length === 1 && !negated) return first
    return makePipeline(commands, negated, first.pos || bangPos)
  }

  // ─── Command: compound or simple ───

  #parseCommand() {
    const t = this.#peekType()

    // time prefix — skip it and parse the rest as a command
    if (t === T.TIME) {
      this.#pos++
      // skip optional -p flag
      if (this.#peekType() === T.WORD && this.#peek().value === '-p') this.#pos++
      return this.#parseCommand()
    }

    // Compound commands
    if (t === T.IF) return this.#parseIf()
    if (t === T.WHILE) return this.#parseWhileUntil('While')
    if (t === T.UNTIL) return this.#parseWhileUntil('Until')
    if (t === T.FOR) return this.#parseFor()
    if (t === T.SELECT) return this.#parseSelect()
    if (t === T.CASE) return this.#parseCase()
    if (t === T.LBRACE) return this.#parseGroup()
    if (t === T.LPAREN && this.#tokens[this.#pos + 1]?.type === T.LPAREN) return this.#parseArithCmd()
    if (t === T.LPAREN) return this.#parseSubshell()
    if (t === T.FUNCTION) return this.#parseFunction()
    if (t === T.COPROC) return this.#parseCoproc()

    // [[ ... ]] conditional
    if (t === T.WORD && this.#peek()?.value === '[[') return this.#parseConditionCmd()

    // Function def: word () { ... }
    if (t === T.WORD && this.#tokens[this.#pos + 1]?.type === T.LPAREN && this.#tokens[this.#pos + 2]?.type === T.RPAREN) {
      return this.#parseFunction()
    }

    return this.#parseSimpleCommand()
  }

  // ─── SimpleCommand ───

  #parseSimpleCommand() {
    const assignments = []
    const words = []
    const redirects = []
    let startPos = null

    while (true) {
      const tok = this.#peek()
      if (!tok) break
      const t = tok.type

      if (!startPos) startPos = tok.pos

      // fd NUMBER followed by redirect
      if (t === T.NUMBER && isRedirToken(this.#tokens[this.#pos + 1]?.type)) {
        const fdTok = tok
        this.#pos++
        const redir = this.#parseRedirect(parseInt(fdTok.value, 10))
        redirects.push(redir)
        continue
      }

      // Redirect
      if (isRedirToken(t)) {
        redirects.push(this.#parseRedirect())
        continue
      }

      // Assignment (only before command name)
      if (t === T.ASSIGNMENT_WORD && words.length === 0) {
        assignments.push(this.#parseAssignment(tok))
        this.#pos++
        continue
      }

      // Word
      if (t === T.WORD || t === T.ASSIGNMENT_WORD || t === T.NUMBER) {
        words.push(makeWord(tok.value, tok.pos))
        this.#pos++
        continue
      }

      // Anything else ends the simple command
      break
    }

    if (words.length === 0 && assignments.length === 0 && redirects.length === 0) return null

    const name = words.length > 0 ? words[0] : null
    const args = words.slice(1)
    return makeSimpleCommand(name, args, assignments, redirects, startPos)
  }

  // Parse redirects that follow compound commands (e.g. `fi > /dev/null`)
  #parseTrailingRedirects() {
    const redirects = []
    while (true) {
      const t = this.#peekType()
      if (t === T.NUMBER && isRedirToken(this.#tokens[this.#pos + 1]?.type)) {
        const fdTok = this.#peek()
        this.#pos++
        redirects.push(this.#parseRedirect(parseInt(fdTok.value, 10)))
      } else if (isRedirToken(t)) {
        redirects.push(this.#parseRedirect())
      } else {
        break
      }
    }
    return redirects.length ? redirects : null
  }

  #parseAssignment(tok) {
    const eqIdx = tok.value.indexOf('=')
    const name = tok.value.slice(0, eqIdx)
    const valStr = tok.value.slice(eqIdx + 1)
    const append = eqIdx > 0 && tok.value[eqIdx - 1] === '+'
    const actualName = append ? name.slice(0, -1) : name
    const rhs = valStr ? makeWord(valStr, { offset: tok.pos.offset + eqIdx + 1 }) : undefined
    return makeAssignment(actualName, rhs, append, tok.pos)
  }

  #parseRedirect(fd) {
    const opTok = this.#peek()
    const op = REDIR_OPS[opTok.type]
    this.#pos++

    // Here-doc and here-string: target is the delimiter/string
    const targetTok = this.#eat(T.WORD)
    const target = makeWord(targetTok.value, targetTok.pos)

    if (fd === undefined) fd = defaultFd(op)
    const redir = makeRedirect(op, fd, target, opTok.pos)

    // For heredocs, find and attach the HEREDOC_BODY to the redirect
    if (op === '<<' || op === '<<-') {
      for (let j = this.#pos; j < this.#tokens.length; j++) {
        if (this.#tokens[j].type === T.HEREDOC_BODY) {
          redir.hereDoc = this.#tokens[j].value
          redir.hereDocEnd = this.#tokens[j].delimiter || targetTok.value
          break
        }
      }
    }
    return redir
  }

  // ─── Compound: if ───

  #parseIf() {
    // Accept both IF and ELIF (elif is a recursive If)
    const tok = this.#peek()
    if (tok.type === T.IF || tok.type === T.ELIF) this.#pos++
    else throw new SyntaxError(`Expected if/elif, got ${tok.type} at line ${tok.pos?.line}`)
    this.#skipNewlines()
    const test = this.#parseCompoundList()
    this.#eat(T.THEN)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    let alternate = null

    if (this.#peekType() === T.ELIF) {
      alternate = this.#parseIf() // elif is recursive If
      // elif already consumed fi
      const redirs = this.#parseTrailingRedirects()
      return makeIf(test, body, alternate, redirs, tok.pos)
    }

    if (this.#match(T.ELSE)) {
      this.#skipNewlines()
      alternate = this.#parseCompoundList()
    }
    this.#eat(T.FI)
    const redirs = this.#parseTrailingRedirects()
    return makeIf(test, body, alternate, redirs, tok.pos)
  }

  // ─── Compound: while/until ───

  #parseWhileUntil(type) {
    const tok = this.#peek()
    this.#pos++ // eat WHILE or UNTIL
    this.#skipNewlines()
    const test = this.#parseCompoundList()
    this.#eat(T.DO)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.DONE)
    const redirs = this.#parseTrailingRedirects()
    return makeWhileUntil(type, test, body, redirs, tok.pos)
  }

  // ─── Compound: for ───

  #parseFor() {
    const tok = this.#eat(T.FOR)

    // Arithmetic for: for (( init; test; step )); do body; done
    if (this.#peekType() === T.LPAREN && this.#tokens[this.#pos + 1]?.type === T.LPAREN) {
      return this.#parseArithFor(tok)
    }

    const nameTok = this.#eat(T.WORD)
    const name = makeWord(nameTok.value, nameTok.pos)

    let items = null
    this.#skipNewlines()
    if (this.#peekType() === T.IN) {
      this.#pos++ // eat IN
      items = []
      while (this.#peekType() === T.WORD || this.#peekType() === T.NUMBER) {
        const w = this.#peek()
        items.push(makeWord(w.value, w.pos))
        this.#pos++
      }
      // consume ; or newline after word list
      if (this.#peekType() === T.SEMI) this.#pos++
    } else if (this.#peekType() === T.SEMI) {
      this.#pos++
    }

    this.#skipNewlines()
    this.#eat(T.DO)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.DONE)
    const redirs = this.#parseTrailingRedirects()
    return makeFor(name, items, body, redirs, tok.pos)
  }

  // ─── Compound: select ───

  #parseSelect() {
    const tok = this.#eat(T.SELECT)
    const nameTok = this.#eat(T.WORD)
    const name = makeWord(nameTok.value, nameTok.pos)

    let items = null
    this.#skipNewlines()
    if (this.#peekType() === T.IN) {
      this.#pos++
      items = []
      while (this.#peekType() === T.WORD || this.#peekType() === T.NUMBER) {
        const w = this.#peek()
        items.push(makeWord(w.value, w.pos))
        this.#pos++
      }
      if (this.#peekType() === T.SEMI) this.#pos++
    } else if (this.#peekType() === T.SEMI) {
      this.#pos++
    }

    this.#skipNewlines()
    this.#eat(T.DO)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.DONE)
    const redirs = this.#parseTrailingRedirects()
    return makeSelect(name, items, body, redirs, tok.pos)
  }

  // Arithmetic for: for (( init; test; step )); do body; done
  // Consume tokens between (( and )) as raw text, split by ;
  #parseArithFor(tok) {
    this.#eat(T.LPAREN)  // first (
    this.#eat(T.LPAREN)  // second (
    // Collect all tokens until )) as raw expression parts
    const parts = [[], [], []]  // init, test, step
    let partIdx = 0
    while (this.#pos < this.#tokens.length) {
      const t = this.#peekType()
      if (t === T.RPAREN && this.#tokens[this.#pos + 1]?.type === T.RPAREN) break
      if (t === T.SEMI) {
        partIdx = Math.min(partIdx + 1, 2)
        this.#pos++
        continue
      }
      parts[partIdx].push(this.#peek().value)
      this.#pos++
    }
    this.#eat(T.RPAREN)  // first )
    this.#eat(T.RPAREN)  // second )
    // optional ;
    if (this.#peekType() === T.SEMI) this.#pos++
    this.#skipNewlines()
    this.#eat(T.DO)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.DONE)
    const redirs = this.#parseTrailingRedirects()
    // Use a special name to indicate arithmetic for
    // bash prints with no space after (( and space before ))
    const arithExpr = `((${parts[0].join('')}; ${parts[1].join('')}; ${parts[2].join('')} ))`
    const name = makeWord(arithExpr, tok.pos)
    return makeFor(name, null, body, redirs, tok.pos)
  }

  // ─── Arithmetic command: (( expr )) ───

  #parseArithCmd() {
    const startTok = this.#peek()
    this.#eat(T.LPAREN)
    this.#eat(T.LPAREN)
    // Collect tokens until ))
    const parts = []
    while (this.#pos < this.#tokens.length) {
      if (this.#peekType() === T.RPAREN && this.#tokens[this.#pos + 1]?.type === T.RPAREN) break
      parts.push(this.#peek().value)
      this.#pos++
    }
    this.#eat(T.RPAREN)
    this.#eat(T.RPAREN)
    const expr = parts.join(' ')
    const redirs = this.#parseTrailingRedirects()
    const word = makeWord(expr, startTok.pos)
    return makeArithmetic(word, redirs, startTok.pos)
  }

  // ─── Compound: [[ ]] ───

  #parseConditionCmd() {
    const startTok = this.#peek()
    this.#pos++ // eat [[
    // Collect all tokens until ]] — operators inside [[ ]] are part of the expression
    const parts = []
    while (this.#pos < this.#tokens.length) {
      const tok = this.#peek()
      if (tok.type === T.WORD && tok.value === ']]') break
      parts.push(tok.value)
      this.#pos++
    }
    if (this.#peekType() === T.WORD) this.#pos++ // eat ]]
    const redirs = this.#parseTrailingRedirects()
    // Build Condition tree from parts
    const cond = this.#buildCondition(parts, startTok.pos)
    // Wrap in a node that prints as [[ ... ]]
    // For simplicity, represent as Condition with the full expression
    return cond
  }

  // Build a Condition tree from token values inside [[ ]]
  #buildCondition(parts, pos) {
    // Find top-level || (lowest precedence)
    let idx = this.#findCondOp(parts, '||')
    if (idx >= 0) {
      const left = this.#buildCondition(parts.slice(0, idx), pos)
      const right = this.#buildCondition(parts.slice(idx + 1), pos)
      return makeCondition('or', null, left, right, pos)
    }
    // Find top-level &&
    idx = this.#findCondOp(parts, '&&')
    if (idx >= 0) {
      const left = this.#buildCondition(parts.slice(0, idx), pos)
      const right = this.#buildCondition(parts.slice(idx + 1), pos)
      return makeCondition('and', null, left, right, pos)
    }
    // Parenthesized: ( expr )
    if (parts[0] === '(' && parts[parts.length - 1] === ')') {
      const inner = this.#buildCondition(parts.slice(1, -1), pos)
      return makeCondition('expr', null, inner, null, pos)
    }
    // Negation: ! expr
    if (parts[0] === '!') {
      const inner = this.#buildCondition(parts.slice(1), pos)
      return makeCondition('unary', makeWord('!', pos), inner, null, pos)
    }
    // Unary: -f file, -d dir, -z str, etc.
    if (parts.length === 2 && parts[0].startsWith('-')) {
      return makeCondition('unary', makeWord(parts[0], pos),
        makeCondition('term', makeWord(parts[1], pos), null, null, pos), null, pos)
    }
    // Binary: str op str (e.g. str == str, str =~ regex, -nt, -ot, etc.)
    if (parts.length === 3) {
      return makeCondition('binary', makeWord(parts[1], pos),
        makeCondition('term', makeWord(parts[0], pos), null, null, pos),
        makeCondition('term', makeWord(parts[2], pos), null, null, pos), pos)
    }
    // Single term
    if (parts.length === 1) {
      return makeCondition('term', makeWord(parts[0], pos), null, null, pos)
    }
    // Fallback: join as single term
    return makeCondition('term', makeWord(parts.join(' '), pos), null, null, pos)
  }

  #findCondOp(parts, op) {
    // Find rightmost occurrence (left-associative)
    let depth = 0
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === ')') depth++
      else if (parts[i] === '(') depth--
      else if (depth === 0 && parts[i] === op) return i
    }
    return -1
  }

  // ─── Compound: coproc ───

  #parseCoproc() {
    const tok = this.#eat(T.COPROC)
    // coproc [NAME] command
    // If next token is a compound command keyword, no name
    // If next is WORD and the one after is a compound keyword or another WORD, first is the name
    let name = null
    const nextType = this.#peekType()

    // Check if next word is followed by a compound command → it's a name
    if (nextType === T.WORD) {
      const afterNext = this.#tokens[this.#pos + 1]?.type
      if (afterNext === T.LBRACE || afterNext === T.LPAREN ||
          afterNext === T.WHILE || afterNext === T.UNTIL || afterNext === T.IF ||
          afterNext === T.FOR || afterNext === T.SELECT || afterNext === T.CASE) {
        name = this.#peek().value
        this.#pos++
      }
    }

    const body = this.#parseCommand()
    const redirs = this.#parseTrailingRedirects()
    return makeCoproc(name, body, redirs, tok.pos)
  }

  // ─── Compound: case ───

  #parseCase() {
    const tok = this.#eat(T.CASE)
    const wordTok = this.#eat(T.WORD)
    const word = makeWord(wordTok.value, wordTok.pos)
    this.#skipNewlines()
    this.#eat(T.IN)
    this.#skipNewlines()

    const clauses = []
    while (this.#peekType() !== T.ESAC && this.#peekType() !== T.EOF) {
      // optional (
      if (this.#peekType() === T.LPAREN) this.#pos++

      // patterns separated by |
      const patterns = []
      while (true) {
        const pTok = this.#eat(T.WORD)
        patterns.push(makeWord(pTok.value, pTok.pos))
        if (this.#peekType() === T.PIPE) { this.#pos++; continue }
        break
      }
      this.#eat(T.RPAREN)
      this.#skipNewlines()

      let body = null
      if (this.#peekType() !== T.SEMI_SEMI && this.#peekType() !== T.SEMI_AND &&
          this.#peekType() !== T.SEMI_SEMI_AND && this.#peekType() !== T.ESAC) {
        body = this.#parseCompoundList()
      }

      let terminator = ';;'
      if (this.#peekType() === T.SEMI_SEMI) { this.#pos++; terminator = ';;' }
      else if (this.#peekType() === T.SEMI_AND) { this.#pos++; terminator = ';&' }
      else if (this.#peekType() === T.SEMI_SEMI_AND) { this.#pos++; terminator = ';;&' }
      this.#skipNewlines()
      clauses.push(makeCaseItem(patterns, body, terminator, patterns[0]?.pos))
    }
    this.#eat(T.ESAC)
    const redirs = this.#parseTrailingRedirects()
    return makeCase(word, clauses, redirs, tok.pos)
  }

  // ─── Compound: { ... } ───

  #parseGroup() {
    const tok = this.#eat(T.LBRACE)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.RBRACE)
    const redirs = this.#parseTrailingRedirects()
    return makeGroup(body, redirs, tok.pos)
  }

  // ─── Compound: ( ... ) ───

  #parseSubshell() {
    const tok = this.#eat(T.LPAREN)
    this.#skipNewlines()
    const body = this.#parseCompoundList()
    this.#eat(T.RPAREN)
    const redirs = this.#parseTrailingRedirects()
    return makeSubshell(body, redirs, tok.pos)
  }

  // ─── Function: [function] name [()] { body } ───

  #parseFunction() {
    let hasKeyword = false
    let tok

    if (this.#peekType() === T.FUNCTION) {
      tok = this.#peek()
      this.#pos++
      hasKeyword = true
    }

    const nameTok = this.#eat(T.WORD)
    if (!tok) tok = nameTok
    const name = makeWord(nameTok.value, nameTok.pos)

    // Optional ()
    if (this.#peekType() === T.LPAREN) {
      this.#pos++
      this.#eat(T.RPAREN)
    }

    this.#skipNewlines()
    const body = this.#parseCommand()
    return makeFunction(name, body, hasKeyword, null, tok.pos)
  }

  // ─── Compound list: sequence of lists separated by ; & newline ───

  #parseCompoundList() {
    this.#skipNewlines()
    const commands = []

    while (true) {
      const cmd = this.#parseList()
      if (!cmd) break
      commands.push(cmd)

      while (this.#peekType() === T.SEMI || this.#peekType() === T.AMP || this.#peekType() === T.NEWLINE) {
        this.#pos++
      }

      // Stop at closing keywords
      const t = this.#peekType()
      if (t === T.THEN || t === T.ELSE || t === T.ELIF || t === T.FI ||
          t === T.DO || t === T.DONE || t === T.ESAC || t === T.RBRACE ||
          t === T.RPAREN || t === T.EOF) break
    }

    if (commands.length === 0) throw new SyntaxError('Expected command')
    if (commands.length === 1) return commands[0]

    // Chain multiple commands with ; operator
    let result = commands[0]
    for (let i = 1; i < commands.length; i++) {
      result = makeList(result, commands[i], ';', result.pos)
    }
    return result
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parse(source, opts = {}) {
  const lexer = new Lexer(source)
  const tokens = lexer.tokenize({ includeComments: true })

  // Separate comments
  const comments = []
  const codeTokens = []
  for (const tok of tokens) {
    if (tok.type === T.COMMENT) comments.push({ type: 'Comment', text: tok.value, pos: tok.pos })
    else codeTokens.push(tok)
  }

  const parser = new Parser(codeTokens)
  if (opts.partial) return parser.parsePartial()
  return parser.parse()
}

export { makeWord, makeSimpleCommand, makePipeline, makeList }
