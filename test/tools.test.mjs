import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ensureSchemaValid, schemaRefs } from '../src/core/schema-tree.mjs'
import { TOOLS_CATALOG } from '../src/tools/catalog.mjs'
import { describe, list, renderHelp, validate } from '../src/tools/index.mjs'

const CLI = new URL('../src/adapters/cli.mjs', import.meta.url).pathname
const ROOT = path.resolve(path.dirname(CLI), '../..')

function runCli(...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  })
}

test('tools catalog validates through system.tools schema', () => {
  assert.equal(validate(TOOLS_CATALOG), TOOLS_CATALOG)
  assert.doesNotThrow(() => ensureSchemaValid(TOOLS_CATALOG, schemaRefs.system('tools'), 'tools'))
})

test('tools schema rejects embedded owner logic in descriptor value', () => {
  const invalid = structuredClone(TOOLS_CATALOG)
  invalid.tools.events['pre-tool-use'].value.logic = 'hidden transition'
  assert.throws(
    () => validate(invalid),
    /tools:/,
  )
})

test('tools schema rejects unknown adapters and accepts roadmap adapter status', () => {
  const invalid = structuredClone(TOOLS_CATALOG)
  invalid.tools.help['tools.help.list'].value.adapters.push('desktop')
  assert.throws(
    () => validate(invalid),
    /tools:/,
  )

  const valid = structuredClone(TOOLS_CATALOG)
  valid.tools.help['tools.help.list'].value.adapter_status.web = 'roadmap'
  assert.doesNotThrow(() => validate(valid))
})

test('tools catalog references existing owner and schema files where paths are local files', () => {
  for (const tool of Object.values(list({ catalog: TOOLS_CATALOG }))) {
    const described = describe(tool.id, { catalog: TOOLS_CATALOG })
    if (described.value.owner.path) {
      assert.equal(fs.existsSync(path.join(ROOT, described.value.owner.path)), true, described.value.owner.path)
    }
    for (const schemaPath of Object.values(described.value.schema ?? {})) {
      assert.equal(fs.existsSync(path.join(ROOT, schemaPath)), true, schemaPath)
    }
  }
})

test('tools owner lists and describes schema-valid object nodes', () => {
  const cliTools = list({ adapter: 'cli', catalog: TOOLS_CATALOG })
  assert.ok(cliTools.some(tool => tool.id === 'pre-tool-use'))
  assert.ok(cliTools.some(tool => tool.id === 'tools.help.list'))
  assert.equal(cliTools.every(tool => tool.adapters.includes('cli')), true)

  const described = describe('pre-tool-use', { catalog: TOOLS_CATALOG })
  assert.equal(described.type, 'event')
  assert.equal(described.status, 'implemented')
  assert.equal(described.value.owner.path, 'src/events/pre-tool-use/')
  assert.deepEqual(Object.keys(described.method).sort(), ['describe', 'invoke', 'verify'])
})

test('help rendering comes from the catalog object tree', () => {
  const fixture = structuredClone(TOOLS_CATALOG)
  fixture.tools.help['fixture.help'] = {
    type: 'help',
    status: 'implemented',
    value: {
      id: 'fixture.help',
      title: 'Fixture help node',
      owner: { kind: 'help', id: 'fixture.help', path: 'src/tools/index.mjs' },
      schema: { tools: 'schema/tools.schema.json' },
      adapters: ['cli'],
      adapter_status: { cli: 'implemented' },
      gates: ['GATE-TOOLS-OBJECT-TREE-01'],
    },
    method: {
      render: { kind: 'render', target: 'src/tools/index.mjs' },
    },
  }
  const text = renderHelp({ adapter: 'cli', catalog: fixture })
  assert.match(text, /fixture\.help/)
  assert.match(text, /Fixture help node/)
})

test('CLI tools commands project the tools owner', () => {
  let out = runCli('tools', 'list', '--adapter', 'cli')
  const tools = JSON.parse(out)
  assert.ok(tools.some(tool => tool.id === 'pre-tool-use'))
  assert.ok(tools.some(tool => tool.id === 'tools.help.describe'))

  out = runCli('tools', 'describe', 'tools.help.describe')
  const described = JSON.parse(out)
  assert.equal(described.type, 'help')
  assert.equal(described.value.owner.path, 'src/tools/index.mjs')
  assert.ok(described.value.gates.includes('GATE-TOOLS-OBJECT-TREE-01'))

  out = runCli('tools', 'help', '--adapter', 'cli')
  assert.match(out, /codex-hooks tools for cli/)
  assert.match(out, /tools\.help\.list/)
})
