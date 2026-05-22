import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const EVENTS_DIR = path.resolve('src/events')
const eventNames = fs.readdirSync(EVENTS_DIR).filter(name => {
  const full = path.join(EVENTS_DIR, name)
  return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, `${name}.mjs`))
})

test('found event modules', () => {
  assert.ok(eventNames.length >= 9, `expected >= 9 event modules, got ${eventNames.length}`)
})

test('no event module imports another event module', () => {
  for (const name of eventNames) {
    const file = path.join(EVENTS_DIR, name, `${name}.mjs`)
    const text = fs.readFileSync(file, 'utf8')
    const importRe = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = importRe.exec(text)) !== null) {
      const target = match[1]
      if (!target.startsWith('.')) continue
      const resolved = path.resolve(path.dirname(file), target)
      const inAnotherEvent = eventNames.some(other => other !== name
        && resolved.startsWith(path.join(EVENTS_DIR, other) + path.sep))
      assert.ok(!inAnotherEvent, `${name}.mjs imports another event module: ${target}`)
    }
  }
})

test('no event module imports src/core/run.mjs or src/core/handlers.mjs', () => {
  for (const name of eventNames) {
    const file = path.join(EVENTS_DIR, name, `${name}.mjs`)
    const text = fs.readFileSync(file, 'utf8')
    assert.equal(text.includes('core/run.mjs'), false, `${name}.mjs imports core/run.mjs`)
    assert.equal(text.includes('core/handlers.mjs'), false, `${name}.mjs imports core/handlers.mjs`)
  }
})

test('every event module has the four files', () => {
  for (const name of eventNames) {
    const dir = path.join(EVENTS_DIR, name)
    for (const required of [`${name}.mjs`, `${name}.rule.schema.json`, 'CLAUDE.md', 'test.mjs']) {
      assert.ok(fs.existsSync(path.join(dir, required)), `${name} missing ${required}`)
    }
  }
})

test('no shared core helper (except handlers.mjs) imports an event module', () => {
  const CORE_DIR = path.resolve('src/core')
  const coreFiles = fs.readdirSync(CORE_DIR).filter(f => f.endsWith('.mjs') && f !== 'handlers.mjs')
  for (const file of coreFiles) {
    const text = fs.readFileSync(path.join(CORE_DIR, file), 'utf8')
    const importRe = /(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g
    let match
    while ((match = importRe.exec(text)) !== null) {
      const target = match[1]
      assert.equal(target.includes('/events/'), false, `src/core/${file} imports event module via ${target}`)
    }
  }
})

test('src/core does not import removed modules (normalize, policy-ops, predicates, reduce, projection)', () => {
  const CORE_DIR = path.resolve('src/core')
  const BANNED = ['normalize.mjs', 'policy-ops.mjs', 'predicates.mjs', 'reduce.mjs', 'projection.mjs']
  const coreFiles = fs.readdirSync(CORE_DIR).filter(f => f.endsWith('.mjs'))
  for (const file of coreFiles) {
    const text = fs.readFileSync(path.join(CORE_DIR, file), 'utf8')
    for (const banned of BANNED) {
      assert.equal(text.includes(banned), false, `src/core/${file} imports banned module ${banned}`)
    }
  }
})

test('src/events does not import src/core/normalize.mjs', () => {
  for (const name of eventNames) {
    const file = path.join(EVENTS_DIR, name, `${name}.mjs`)
    const text = fs.readFileSync(file, 'utf8')
    assert.equal(text.includes('core/normalize.mjs'), false, `${name}.mjs still imports core/normalize.mjs`)
  }
})
