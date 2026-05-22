/**
 * Bash Lexer — Phase 1
 * Tokenizes bash source into a token stream.
 * Context-dependent: reserved words only in command position.
 */

// Token types from tokens.json
const T = {
  WORD: 'WORD',
  ASSIGNMENT_WORD: 'ASSIGNMENT_WORD',
  NUMBER: 'NUMBER',
  NEWLINE: 'NEWLINE',
  SEMI: 'SEMI',
  AMP: 'AMP',
  PIPE: 'PIPE',
  AND_AND: 'AND_AND',
  OR_OR: 'OR_OR',
  BAR_AND: 'BAR_AND',
  SEMI_SEMI: 'SEMI_SEMI',
  SEMI_AND: 'SEMI_AND',       // ;&
  SEMI_SEMI_AND: 'SEMI_SEMI_AND', // ;;&
  GREAT: 'GREAT',
  LESS: 'LESS',
  GREATER_GREATER: 'GREATER_GREATER',
  LESS_LESS: 'LESS_LESS',
  LESS_AND: 'LESS_AND',
  GREATER_AND: 'GREATER_AND',
  LESS_LESS_MINUS: 'LESS_LESS_MINUS',
  LESS_LESS_LESS: 'LESS_LESS_LESS',
  AND_GREATER: 'AND_GREATER',
  AND_GREATER_GREATER: 'AND_GREATER_GREATER',
  LESS_GREATER: 'LESS_GREATER',
  GREATER_BAR: 'GREATER_BAR',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  BANG: 'BANG',
  // Reserved words
  IF: 'IF', THEN: 'THEN', ELSE: 'ELSE', ELIF: 'ELIF', FI: 'FI',
  CASE: 'CASE', ESAC: 'ESAC', FOR: 'FOR', SELECT: 'SELECT',
  WHILE: 'WHILE', UNTIL: 'UNTIL', DO: 'DO', DONE: 'DONE',
  IN: 'IN', FUNCTION: 'FUNCTION', COPROC: 'COPROC',
  TIME: 'TIME',
  HEREDOC_BODY: 'HEREDOC_BODY',
  COMMENT: 'COMMENT',
  EOF: 'EOF',
}

const RESERVED_WORDS = new Map([
  ['if', T.IF], ['then', T.THEN], ['else', T.ELSE], ['elif', T.ELIF], ['fi', T.FI],
  ['case', T.CASE], ['esac', T.ESAC], ['for', T.FOR], ['select', T.SELECT],
  ['while', T.WHILE], ['until', T.UNTIL], ['do', T.DO], ['done', T.DONE],
  ['in', T.IN], ['function', T.FUNCTION], ['coproc', T.COPROC],
  ['time', T.TIME], ['!', T.BANG],
  ['{', T.LBRACE], ['}', T.RBRACE],
])

// Operator table — longest match first
const OPERATORS = [
  ['&&', T.AND_AND],
  ['||', T.OR_OR],
  ['|&', T.BAR_AND],
  [';;&', T.SEMI_SEMI_AND],
  [';&', T.SEMI_AND],
  [';;', T.SEMI_SEMI],
  ['>>', T.GREATER_GREATER],
  ['<<-', T.LESS_LESS_MINUS],
  ['<<<', T.LESS_LESS_LESS],
  ['<<', T.LESS_LESS],
  ['<&', T.LESS_AND],
  ['>&', T.GREATER_AND],
  ['&>>', T.AND_GREATER_GREATER],
  ['&>', T.AND_GREATER],
  ['<>', T.LESS_GREATER],
  ['>|', T.GREATER_BAR],
  ['|', T.PIPE],
  ['&', T.AMP],
  [';', T.SEMI],
  ['>', T.GREAT],
  ['<', T.LESS],
  ['(', T.LPAREN],
  [')', T.RPAREN],
]

export class Lexer {
  #src
  #pos
  #line
  #col
  #len
  #commandPosition  // true when next word could be a reserved word
  #reserveAfterWord // true when next word is unreserved but the one AFTER should check reserved (case WORD in, for WORD in)

  constructor(source) {
    this.#src = source
    this.#pos = 0
    this.#line = 1
    this.#col = 1
    this.#len = source.length
    this.#commandPosition = true
    this.#reserveAfterWord = false
  }

  #peek(n = 0) {
    return this.#pos + n < this.#len ? this.#src[this.#pos + n] : null
  }

  #advance() {
    const ch = this.#src[this.#pos]
    if (ch === '\n') { this.#line++; this.#col = 1 }
    else { this.#col++ }
    this.#pos++
    return ch
  }

  // Skip nested open/close pair with quote awareness (handles $(")" ) etc.)
  #skipNested(open, close) {
    let depth = 1
    while (this.#pos < this.#len && depth > 0) {
      const c = this.#src[this.#pos]
      if (c === "'" ) {
        this.#advance()
        while (this.#pos < this.#len && this.#src[this.#pos] !== "'") this.#advance()
        if (this.#pos < this.#len) this.#advance()
        continue
      }
      if (c === '"') {
        this.#advance()
        while (this.#pos < this.#len) {
          const q = this.#src[this.#pos]
          if (q === '\\' && this.#pos + 1 < this.#len) { this.#advance(); this.#advance(); continue }
          if (q === '"') { this.#advance(); break }
          this.#advance()
        }
        continue
      }
      if (c === '\\' && this.#pos + 1 < this.#len) { this.#advance(); this.#advance(); continue }
      if (c === open) depth++
      else if (c === close) depth--
      if (depth > 0) this.#advance()
    }
    if (this.#pos < this.#len) this.#advance()
  }

  #makeToken(type, value, startPos, startLine, startCol) {
    return {
      type,
      value,
      pos: { offset: startPos, line: startLine, column: startCol }
    }
  }

  #skipSpaces() {
    while (this.#pos < this.#len) {
      const ch = this.#src[this.#pos]
      if (ch === ' ' || ch === '\t') this.#advance()
      else if (ch === '\\' && this.#peek(1) === '\n') {
        this.#advance(); this.#advance() // line continuation
      }
      else break
    }
  }

  #readComment() {
    const start = this.#pos, sl = this.#line, sc = this.#col
    this.#advance() // skip #
    while (this.#pos < this.#len && this.#src[this.#pos] !== '\n') this.#advance()
    return this.#makeToken(T.COMMENT, this.#src.slice(start, this.#pos), start, sl, sc)
  }

  #readWord() {
    const start = this.#pos, sl = this.#line, sc = this.#col
    let hasEquals = false
    let equalsPos = -1

    while (this.#pos < this.#len) {
      const ch = this.#src[this.#pos]

      // Process substitution: <(...) and >(...)
      if ((ch === '<' || ch === '>') && this.#pos + 1 < this.#len && this.#src[this.#pos + 1] === '(') {
        this.#advance() // < or >
        this.#advance() // (
        this.#skipNested('(', ')')
        continue
      }

      // Shell metacharacters break the word
      if (' \t\n|&;<>()'.includes(ch)) break

      // Quoting
      if (ch === "'") {
        this.#advance()
        while (this.#pos < this.#len && this.#src[this.#pos] !== "'") this.#advance()
        if (this.#pos < this.#len) this.#advance() // closing '
        continue
      }
      if (ch === '"') {
        this.#advance()
        while (this.#pos < this.#len) {
          const c = this.#src[this.#pos]
          if (c === '\\' && this.#pos + 1 < this.#len) { this.#advance(); this.#advance(); continue }
          if (c === '"') { this.#advance(); break }
          this.#advance()
        }
        continue
      }
      if (ch === '\\' && this.#pos + 1 < this.#len) {
        this.#advance(); this.#advance()
        continue
      }

      // $(...) and ${...} and $((...))
      if (ch === '$') {
        this.#advance()
        const next = this.#peek()
        if (next === '(' || next === '{') {
          const close = next === '(' ? ')' : '}'
          this.#advance()
          this.#skipNested(next, close)
        }
        continue
      }

      // Backtick
      if (ch === '`') {
        this.#advance()
        while (this.#pos < this.#len && this.#src[this.#pos] !== '`') {
          if (this.#src[this.#pos] === '\\') this.#advance()
          this.#advance()
        }
        if (this.#pos < this.#len) this.#advance()
        continue
      }

      // Track first unquoted = for assignment detection (including +=)
      if (ch === '=' && !hasEquals && this.#pos > start) {
        hasEquals = true
        equalsPos = this.#pos - start
        // Array assignment: NAME=(word ...) — consume the parenthesized list
        if (this.#pos + 1 < this.#len && this.#src[this.#pos + 1] === '(') {
          this.#advance() // =
          this.#advance() // (
          let depth = 1
          while (this.#pos < this.#len && depth > 0) {
            const c = this.#src[this.#pos]
            if (c === '(') depth++
            else if (c === ')') depth--
            if (depth > 0) this.#advance()
          }
          if (this.#pos < this.#len) this.#advance() // closing )
          continue
        }
      }
      if (ch === '+' && !hasEquals && this.#pos > start && this.#pos + 1 < this.#len && this.#src[this.#pos + 1] === '=') {
        hasEquals = true
        equalsPos = this.#pos - start + 1 // point at '=', not '+'
      }

      this.#advance()
    }

    const text = this.#src.slice(start, this.#pos)
    if (!text) return null

    // Assignment detection: NAME=... or NAME+=... where NAME is [a-zA-Z_][a-zA-Z0-9_]*
    if (hasEquals) {
      const name = text.slice(0, equalsPos)
      const actualName = name.endsWith('+') ? name.slice(0, -1) : name
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(actualName)) {
        return this.#makeToken(T.ASSIGNMENT_WORD, text, start, sl, sc)
      }
    }

    // fd number before redirect: digits only, followed by < or >
    if (/^\d+$/.test(text) && this.#pos < this.#len && '<>'.includes(this.#src[this.#pos])) {
      return this.#makeToken(T.NUMBER, text, start, sl, sc)
    }

    return this.#makeToken(T.WORD, text, start, sl, sc)
  }

  #tryOperator() {
    // Sort by length descending already done in OPERATORS array
    for (const [op, type] of OPERATORS) {
      if (this.#src.startsWith(op, this.#pos)) {
        const sl = this.#line, sc = this.#col, start = this.#pos
        for (let i = 0; i < op.length; i++) this.#advance()
        return this.#makeToken(type, op, start, sl, sc)
      }
    }
    return null
  }

  next() {
    this.#skipSpaces()
    if (this.#pos >= this.#len) {
      return this.#makeToken(T.EOF, '', this.#pos, this.#line, this.#col)
    }

    const ch = this.#src[this.#pos]

    // Newline
    if (ch === '\n') {
      const sl = this.#line, sc = this.#col, start = this.#pos
      this.#advance()
      this.#commandPosition = true
      return this.#makeToken(T.NEWLINE, '\n', start, sl, sc)
    }

    // Comment
    if (ch === '#') {
      const tok = this.#readComment()
      this.#commandPosition = true
      return tok
    }

    // Process substitution: <(...) and >(...) are words, not operators
    if ((ch === '<' || ch === '>') && this.#peek(1) === '(') {
      const wordTok = this.#readWord()
      if (wordTok) {
        this.#commandPosition = false
        return wordTok
      }
    }

    // Operators
    const opTok = this.#tryOperator()
    if (opTok) {
      // After these operators, next word is in command position
      const t = opTok.type
      this.#commandPosition = (
        t === T.SEMI || t === T.AMP || t === T.AND_AND || t === T.OR_OR ||
        t === T.PIPE || t === T.BAR_AND || t === T.SEMI_SEMI ||
        t === T.LPAREN || t === T.RPAREN
      )
      return opTok
    }

    // Word
    const wordTok = this.#readWord()
    if (!wordTok) {
      // Shouldn't happen, but skip unknown char
      const sl = this.#line, sc = this.#col, start = this.#pos
      this.#advance()
      return this.#makeToken(T.WORD, this.#src[start], start, sl, sc)
    }

    // Reserved word check — only in command position
    if (wordTok.type === T.WORD && this.#commandPosition) {
      const rw = RESERVED_WORDS.get(wordTok.value)
      if (rw) {
        wordTok.type = rw
        // After certain reserved words, stay in command position
        this.#commandPosition = (
          rw === T.THEN || rw === T.ELSE || rw === T.ELIF ||
          rw === T.DO || rw === T.LBRACE || rw === T.BANG ||
          rw === T.TIME || rw === T.IN
        )
        // case WORD in / for WORD in — word after CASE/FOR is not reserved, but the one after that is
        // function NAME { — word after FUNCTION is not reserved, but { after that must be
        this.#reserveAfterWord = (rw === T.CASE || rw === T.FOR || rw === T.SELECT || rw === T.FUNCTION || rw === T.COPROC)
        return wordTok
      }
    }

    // After a regular word or assignment, no longer command position
    // UNLESS #reserveAfterWord is set (case WORD → next should check reserved for 'in')
    if (this.#reserveAfterWord) {
      this.#commandPosition = true
      this.#reserveAfterWord = false
    } else {
      this.#commandPosition = false
    }
    return wordTok
  }

  /** Tokenize entire source, returns array (excludes comments by default). */
  tokenize({ includeComments = false } = {}) {
    const tokens = []
    while (true) {
      const tok = this.next()
      if (tok.type === T.EOF) { tokens.push(tok); break }
      if (tok.type === T.COMMENT && !includeComments) continue
      tokens.push(tok)
    }
    // Post-pass: resolve heredocs
    return this.#resolveHeredocs(tokens)
  }

  #resolveHeredocs(tokens) {
    const src = this.#src
    const result = []
    // Collect pending heredocs: [{delimIdx, delimiter, strip}]
    const pending = []

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      result.push(t)

      // Detect << or <<- followed by WORD (delimiter)
      if ((t.type === T.LESS_LESS || t.type === T.LESS_LESS_MINUS) && tokens[i + 1]?.type === T.WORD) {
        const strip = t.type === T.LESS_LESS_MINUS
        let delim = tokens[i + 1].value
        // Strip quotes from delimiter (but remember it was quoted → no expansion)
        const quoted = /^['"]/.test(delim) || delim.includes('\\')
        delim = delim.replace(/^['"]|['"]$/g, '').replace(/\\/g, '')
        pending.push({ delim, strip, insertAfterNewline: true })
      }

      // When we hit a NEWLINE and have pending heredocs, consume their bodies
      if (t.type === T.NEWLINE && pending.length > 0) {
        // Find the position in source right after this newline
        let srcPos = t.pos.offset + 1
        while (pending.length > 0) {
          const hd = pending.shift()
          const bodyStart = srcPos
          let bodyEnd = bodyStart
          // Read lines until we find the delimiter on its own line
          while (srcPos < src.length) {
            const lineStart = srcPos
            // Find end of line
            let lineEnd = src.indexOf('\n', srcPos)
            if (lineEnd === -1) lineEnd = src.length
            let line = src.slice(lineStart, lineEnd)
            // For <<-, strip leading tabs before comparing
            const trimmed = hd.strip ? line.replace(/^\t+/, '') : line
            srcPos = lineEnd < src.length ? lineEnd + 1 : src.length
            if (trimmed === hd.delim) {
              bodyEnd = lineStart
              break
            }
            bodyEnd = srcPos
          }
          const body = src.slice(bodyStart, bodyEnd)
          result.push({
            type: T.HEREDOC_BODY,
            value: body,
            delimiter: hd.delim,
            strip: hd.strip,
            pos: { offset: bodyStart, line: -1, column: -1 }
          })
        }
        // Skip tokens that were part of the heredoc body (already consumed from source)
        // srcPos points past the last delimiter line — use it directly
        while (i + 1 < tokens.length && tokens[i + 1].type !== T.EOF && tokens[i + 1].pos.offset < srcPos) {
          i++
        }
      }
    }
    return result
  }
}

export { T }
