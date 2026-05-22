/**
 * Bash AST Query Layer
 * Extracts structured info from parsed AST for rule matching.
 * Input: plain object from parse(src).$toDict()
 */

// ─── Walk helpers ────────────────────────────────────────────────────────────

function walk(node, visitor) {
  if (!node) return
  visitor(node)
  switch (node.type) {
    case 'Script':
      node.commands?.forEach(c => walk(c, visitor)); break
    case 'SimpleCommand':
      break // leaf
    case 'Pipeline':
      node.commands?.forEach(c => walk(c, visitor)); break
    case 'List':
      walk(node.left, visitor); walk(node.right, visitor); break
    case 'If':
      walk(node.test, visitor); walk(node.body, visitor); walk(node.alternate, visitor); break
    case 'While': case 'Until':
      walk(node.test, visitor); walk(node.body, visitor); break
    case 'For': case 'Select':
      walk(node.body, visitor); break
    case 'Case':
      node.clauses?.forEach(c => walk(c.body, visitor)); break
    case 'Group': case 'Subshell':
      walk(node.body, visitor); break
    case 'Function':
      walk(node.body, visitor); break
    case 'Coproc':
      walk(node.body, visitor); break
    case 'Arithmetic': case 'Condition':
      break // leaf-like
  }
}

function collectSimpleCommands(ast) {
  const cmds = []
  walk(ast, node => { if (node.type === 'SimpleCommand') cmds.push(node) })
  return cmds
}

// ─── Word text extraction ────────────────────────────────────────────────────

function wordText(w) { return w?.text ?? '' }

function splitFlags(args) {
  const flags = [], positional = []
  for (const a of args) {
    const t = wordText(a)
    if (t.startsWith('-')) flags.push(t)
    else positional.push(t)
  }
  return { flags, positional }
}

// ─── Redirect analysis ──────────────────────────────────────────────────────

const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>'])
const READ_OPS = new Set(['<', '<<', '<<<', '<>'])

function classifyRedirects(redirects) {
  const writes = [], reads = [], dups = []
  for (const r of (redirects || [])) {
    const target = wordText(r.target)
    if (WRITE_OPS.has(r.op)) writes.push({ op: r.op, target, fd: r.fd })
    else if (r.op === '>&' || r.op === '<&') dups.push({ op: r.op, target, fd: r.fd })
    else if (READ_OPS.has(r.op)) reads.push({ op: r.op, target, fd: r.fd })
  }
  return { writes, reads, dups }
}

// ─── Pipeline analysis ──────────────────────────────────────────────────────

function getPipeChain(ast) {
  const chains = []
  walk(ast, node => {
    if (node.type === 'Pipeline') {
      chains.push(node.commands.map(c => {
        if (c.type === 'SimpleCommand') {
          const name = wordText(c.name)
          const args = (c.args || []).map(a => wordText(a))
          return { name, args }
        }
        return { name: c.type, args: [] }
      }))
    }
  })
  return chains
}

// ─── Subcommand extraction ($(), ``) ─────────────────────────────────────────

const SUBCMD_RE = /\$\(([^)]+)\)|`([^`]+)`/g

function getSubcommands(ast) {
  const subs = []
  walk(ast, node => {
    if (node.type !== 'SimpleCommand') return
    const texts = []
    if (node.name) texts.push(wordText(node.name))
    node.args?.forEach(a => texts.push(wordText(a)))
    node.assignments?.forEach(a => texts.push(a.rhs?.text ?? ''))
    for (const t of texts) {
      let m
      SUBCMD_RE.lastIndex = 0
      while ((m = SUBCMD_RE.exec(t))) subs.push(m[1] || m[2])
    }
  })
  return subs
}

// ─── Prefix-command unwrapping ───────────────────────────────────────────────

const PREFIX_CMDS = new Set([
  'sudo', 'env', 'nohup', 'nice', 'ionice', 'strace', 'ltrace',
  'time', 'xargs', 'exec', 'command', 'builtin',
])

/** Unwrap prefix commands: sudo rm -rf → { name: rm, args: [-rf] } */
function _unwrap(cmd) {
  let name = cmd.name
  let args = cmd.args || []
  while (name && PREFIX_CMDS.has(wordText(name))) {
    // Skip flags of the prefix command (e.g. sudo -u root → skip -u root)
    let i = 0
    // env: skip VAR=val pairs
    if (wordText(name) === 'env') {
      while (i < args.length && /^[A-Za-z_]\w*=/.test(wordText(args[i]))) i++
    }
    // Skip flags (start with -)
    while (i < args.length && wordText(args[i]).startsWith('-')) {
      i++
      // Flags that take a value: sudo -u <user>, nice -n <val>, ionice -c <val>
      if (i < args.length && !wordText(args[i]).startsWith('-')) { i++; }
    }
    if (i >= args.length) break // no actual command after prefix
    name = args[i]
    args = args.slice(i + 1)
  }
  return { name, args }
}

// ─── Main Query class ────────────────────────────────────────────────────────

export class BashQuery {
  #ast
  #cmds // cached SimpleCommands

  constructor(ast) {
    this.#ast = ast
    this.#cmds = collectSimpleCommands(ast)
  }

  /** All command names invoked (top-level, no subcommands) */
  commands() {
    return this.#cmds.map(c => wordText(c.name)).filter(Boolean)
  }

  /** All flags across all commands */
  flags() {
    const all = new Set()
    for (const c of this.#cmds) {
      for (const a of (c.args || [])) {
        const t = wordText(a)
        if (t.startsWith('-')) all.add(t)
      }
    }
    return [...all]
  }

  /** All non-flag arguments across all commands */
  args() {
    const all = []
    for (const c of this.#cmds) {
      for (const a of (c.args || [])) {
        const t = wordText(a)
        if (!t.startsWith('-')) all.push(t)
      }
    }
    return all
  }

  /** Check if any command has a specific flag */
  hasFlag(flag) {
    return this.flags().includes(flag)
  }

  /** Get info for a specific command by name */
  command(name) {
    const matches = this.#cmds.filter(c => wordText(c.name) === name)
    return matches.map(c => {
      const { flags, positional } = splitFlags(c.args || [])
      const { writes, reads, dups } = classifyRedirects(c.redirects)
      return { name, flags, args: positional, writes, reads, dups,
               assignments: (c.assignments || []).map(a => ({ name: a.name, value: a.rhs?.text ?? '', append: !!a.append })) }
    })
  }

  /** All pipe chains as arrays of {name, args} */
  pipes() {
    return getPipeChain(this.#ast)
  }

  /** Pipe chains as flat command name arrays (convenience) */
  pipeNames() {
    return getPipeChain(this.#ast).map(chain => chain.map(c => c.name))
  }

  /** All write redirect targets */
  writes() {
    const w = []
    for (const c of this.#cmds) {
      const { writes } = classifyRedirects(c.redirects)
      w.push(...writes.map(r => r.target))
    }
    return w
  }

  /** All read redirect targets */
  reads() {
    const r = []
    for (const c of this.#cmds) {
      const { reads } = classifyRedirects(c.redirects)
      r.push(...reads.map(x => x.target))
    }
    return r
  }

  /** Subcommands found in $() and `` */
  subcommands() {
    return getSubcommands(this.#ast)
  }

  /** All variable assignments */
  assignments() {
    const all = []
    for (const c of this.#cmds) {
      for (const a of (c.assignments || [])) {
        all.push({ name: a.name, value: a.rhs?.text ?? '', append: !!a.append })
      }
    }
    return all
  }

  /** All function definitions */
  functions() {
    const fns = []
    walk(this.#ast, node => {
      if (node.type === 'Function') fns.push(wordText(node.name))
    })
    return fns
  }

  /**
   * Check if a command appears anywhere, unwrapping prefix commands
   * (sudo, env, nohup, etc). Optionally check for a specific flag.
   * q.has('rm', '-rf') → true even for "sudo rm -rf /"
   */
  has(name, flag) {
    for (const c of this.#cmds) {
      const u = _unwrap(c)
      if (wordText(u.name) !== name) continue
      if (!flag) return true
      if ((u.args || []).some(a => wordText(a) === flag)) return true
    }
    return false
  }

  /**
   * Every simple command as a record with name/flags/args/writes/reads/...,
   * plus an unwrapped record for each prefix command (sudo / env / nohup / ...).
   * The unwrapped record preserves token order so flag/arg splitting is correct.
   */
  simpleCommands() {
    const out = []
    for (const c of this.#cmds) {
      out.push(this.#recordFromSimple(c))
      const u = _unwrap(c)
      if (wordText(u.name) !== wordText(c.name)) {
        out.push(this.#recordFromTokens(u.name, u.args, c.redirects, c.assignments))
      }
    }
    return out
  }

  #recordFromSimple(c) {
    const { flags, positional } = splitFlags(c.args || [])
    const { writes, reads, dups } = classifyRedirects(c.redirects)
    return {
      name: wordText(c.name),
      flags,
      args: positional,
      writes,
      reads,
      dups,
      assignments: (c.assignments || []).map(a => ({ name: a.name, value: a.rhs?.text ?? '', append: !!a.append })),
    }
  }

  #recordFromTokens(name, args, redirects, assignments) {
    const { flags, positional } = splitFlags(args || [])
    const { writes, reads, dups } = classifyRedirects(redirects)
    return {
      name: wordText(name),
      flags,
      args: positional,
      writes,
      reads,
      dups,
      assignments: (assignments || []).map(a => ({ name: a.name, value: a.rhs?.text ?? '', append: !!a.append })),
    }
  }

  /** Full structured output — one call, everything */
  analyze() {
    return {
      commands: this.commands(),
      flags: this.flags(),
      args: this.args(),
      pipes: this.pipes(),
      writes: this.writes(),
      reads: this.reads(),
      assignments: this.assignments(),
      functions: this.functions(),
      subcommands: this.subcommands(),
    }
  }

  /** Raw AST access */
  get ast() { return this.#ast }
}

// ─── Convenience ─────────────────────────────────────────────────────────────

import { parse } from './parser.mjs'

export function query(src) {
  return new BashQuery(parse(src))
}
