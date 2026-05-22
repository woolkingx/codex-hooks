import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { listEvents } from '../core/handlers.mjs'
import { readJson, rootPath } from '../core/load.mjs'
import { buildUserRuleSyncReport } from '../policy/user.mjs'

export function runDoctor(options = {}) {
  const environment = detectEnvironment(options)
  const artifact = detectArtifact(options)
  const checks = [
    checkNodeVersion(environment.node_version),
    checkPackageRoot(environment.package_root),
    checkRulesRoot(options.rulesRoot ?? 'policy/rules'),
    checkPolicySync(options.userPath ?? 'policy/user.json', options.rulesRoot ?? 'policy/rules'),
    checkTargetPath(environment, options.target ?? 'project'),
    checkDataSchemas(),
    checkEventOwnerCoverage(),
  ]
  return {
    environment,
    artifact,
    doctor: {
      ok: checks.every(check => check.status !== 'fail'),
      checks,
      warnings: checks.filter(check => check.status === 'warn').map(check => check.message),
      failures: checks.filter(check => check.status === 'fail').map(check => check.message),
    },
  }
}

export function detectEnvironment(options = {}) {
  return {
    platform: process.platform,
    cwd: options.cwd ?? process.cwd(),
    git_root: options.gitRoot ?? detectGitRoot(options.cwd ?? process.cwd()),
    codex_home: options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
    node_version: process.version,
    package_root: rootPath(),
  }
}

export function detectArtifact(options = {}) {
  const pkg = readJson('package.json')
  return {
    bin_command: options.binCommand ?? 'codex-hooks',
    package_root: rootPath(),
    version: pkg.version,
  }
}

export function destinationFor(environment, target = 'project') {
  if (target === 'user') return path.join(environment.codex_home, 'hooks.json')
  const base = environment.git_root ?? environment.cwd
  return path.join(base, '.codex', 'hooks.json')
}

function detectGitRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function checkNodeVersion(version) {
  const major = Number(version.replace(/^v/, '').split('.')[0])
  if (major >= 20) return pass('node', `${version} satisfies Node.js >= 20`)
  return fail('node', `${version} does not satisfy Node.js >= 20`)
}

function checkPackageRoot(packageRoot) {
  const ok = fs.existsSync(path.join(packageRoot, 'package.json'))
  return ok ? pass('package_root', packageRoot) : fail('package_root', `missing package.json at ${packageRoot}`)
}

function checkRulesRoot(rulesRoot) {
  const absolute = path.isAbsolute(rulesRoot) ? rulesRoot : rootPath(rulesRoot)
  return fs.existsSync(absolute) ? pass('rules_root', rulesRoot) : fail('rules_root', `missing rules root: ${rulesRoot}`)
}

function checkPolicySync(userPath, rulesRoot) {
  try {
    const report = buildUserRuleSyncReport({ userPath, rulesRoot })
    if (report.ok) return pass('policy_sync', `${report.requirements.length} requirements match ${report.rules.length} rules`)
    const states = [
      ...report.requirements.filter(item => item.state !== 'ok').map(item => `${item.id}:${item.state}`),
      ...report.rules.filter(item => item.state !== 'ok').map(item => `${item.rule_path}:${item.state}`),
    ]
    return fail('policy_sync', `policy/user.json and rule files are not synchronized: ${states.join(', ')}`)
  } catch (error) {
    return fail('policy_sync', error.message)
  }
}

function checkTargetPath(environment, target) {
  const destination = destinationFor(environment, target)
  const parent = path.dirname(destination)
  if (fs.existsSync(parent)) return pass('target_path', destination)
  return warn('target_path', `target directory does not exist yet: ${parent}`)
}

function checkDataSchemas() {
  const required = [
    'schema/config.schema.json',
    'schema/deploy.schema.json',
    'schema/log.schema.json',
    'schema/profile.schema.json',
    'schema/status.schema.json',
    'schema/user-policy.schema.json',
  ]
  const missing = required.filter(file => !fs.existsSync(rootPath(file)))
  if (missing.length === 0) return pass('data_schemas', 'required data schemas exist')
  return fail('data_schemas', `missing required data schemas: ${missing.join(',')}`)
}

function checkEventOwnerCoverage() {
  const generatedDir = rootPath('schema/api/openai-codex/generated')
  const expected = fs.readdirSync(generatedDir)
    .filter(f => f.endsWith('.command.input.schema.json'))
    .map(f => f.replace('.command.input.schema.json', ''))
    .sort()
  const actual = listEvents().sort()
  if (JSON.stringify(expected) === JSON.stringify(actual)) return pass('event_owner_coverage', 'all official events have handlers')
  return fail('event_owner_coverage', `expected ${expected.join(',')}; got ${actual.join(',')}`)
}

function pass(name, message) {
  return { name, status: 'pass', message }
}

function warn(name, message) {
  return { name, status: 'warn', message }
}

function fail(name, message) {
  return { name, status: 'fail', message }
}
