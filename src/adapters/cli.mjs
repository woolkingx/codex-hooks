#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listEvents } from '../core/handlers.mjs'
import { loadConfig, loadRules } from '../core/load.mjs'
import { runHook } from '../core/run.mjs'
import { toErrorPDU } from '../core/errors.mjs'
import { applyInstallPlan, createInstallPlan, renderHooksConfig, runDoctor } from '../deploy/index.mjs'
import { appendLog, buildLogRecord, readLogTail } from '../log/index.mjs'
import { readStatus } from '../status/index.mjs'
import { buildUserRuleSyncReport, loadUserPolicy } from '../policy/user.mjs'

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exit(1)
  })
}

export async function main(args) {
  const [command, ...rest] = args
  if (command === 'hook') return runFromStdin(rest)
  if (command === 'run' && rest[0]) return runFromFile(rest[0], rest.slice(1))
  if (command === 'events') return writeJson(listEvents())
  if (command === 'policy') return policyCommand(rest)
  if (command === 'logs') return writeJson(readLogTail(logOptions(rest)))
  if (command === 'status') return writeJson(readStatus(logOptions(rest)))
  if (command === 'render-hooks') return writeJson(renderHooksConfig(deployOptions(rest)))
  if (command === 'doctor') return writeJson(runDoctor(deployOptions(rest)).doctor)
  if (command === 'install') return installCommand(rest)
  usage()
}

async function runFromStdin(rest) {
  const raw = fs.readFileSync(0, 'utf8')
  await runFromText(raw, rest)
}

async function runFromFile(file, rest) {
  const raw = fs.readFileSync(file, 'utf8')
  await runFromText(raw, rest)
}

async function runFromText(text, rest) {
  const started = performance.now()
  const createdAt = new Date().toISOString()
  const config = loadConfig(flagValue(rest, '--config') ?? undefined)
  const rulesRoot = flagValue(rest, '--rules') ?? config?.source?.rules_root ?? 'policy/rules'
  const profilePath = flagValue(rest, '--profile') ?? config?.source?.profile_path ?? undefined
  const logPath = flagValue(rest, '--log') ?? config?.log?.path ?? undefined
  const failClosed = parseFailClosed(flagValue(rest, '--fail-closed'), config?.mode?.fail_closed)
  const dryRun = parseDryRun(flagValue(rest, '--dry-run'), config?.mode?.runtime)
  const redactionPatterns = config?.log?.redaction
  let input = null
  let result = null
  let error = null
  try {
    input = JSON.parse(text)
  } catch (caught) {
    error = caught
    if (!failClosed) {
      writeLog(null, null, logPath, started, createdAt, redactionPatterns, error)
      throw caught
    }
    result = errorResultFor(null, error)
  }
  if (!result) {
    try {
      result = await runHook(input, { rulesRoot, profilePath, failClosed, dryRun })
    } catch (caught) {
      error = caught
      if (!failClosed) {
        writeLog(input, null, logPath, started, createdAt, redactionPatterns, error)
        throw caught
      }
      result = errorResultFor(input, error)
    }
  }
  writeLog(input, result, logPath, started, createdAt, redactionPatterns, error)
  if (result?.output == null) return
  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`)
}

function errorResultFor(input, error) {
  return {
    event: { instance: { id: null, event_name: input?.hook_event_name ?? 'unknown' } },
    fired_rule_id: null,
    output: { continue: true, systemMessage: `codex-hooks error: ${error.message ?? String(error)}` },
    error: toErrorPDU(error, 'executor'),
  }
}

function writeLog(input, result, logPath, started, createdAt, redactionPatterns, error) {
  if (!logPath) return
  const eventName = result?.event?.instance?.event_name ?? input?.hook_event_name ?? 'unknown'
  const eventId = result?.event?.instance?.id ?? ''
  const firedRuleId = result?.fired_rule_id ?? null
  const record = buildLogRecord(input, eventName, eventId, firedRuleId, result?.output ?? null, {
    createdAt,
    durationMs: performance.now() - started,
    redactionPatterns,
    errorPDU: result?.error ?? null,
    error,
  })
  try {
    appendLog(record, { logPath })
  } catch (caught) {
    process.stderr.write(`codex-hooks log write failed: ${caught.message ?? String(caught)}\n`)
  }
}

async function policyCommand(args) {
  const [sub, ...rest] = args
  if (sub === 'requirements') return requirementsCommand(rest)
  if (sub === 'build') return policyBuildCommand(rest)
  if (sub === 'explain') return policyExplainCommand(rest)
  const rulesRoot = flagValue(rest, '--rules') ?? 'policy/rules'
  const profilePath = flagValue(rest, '--profile') ?? undefined
  if (sub === 'compile') {
    const compiled = loadRules({ rulesRoot, profilePath })
    const out = flagValue(rest, '--out')
    if (out) fs.writeFileSync(out, JSON.stringify(compiled, null, 2))
    else writeJson(compiled)
    return
  }
  usage()
}

async function policyBuildCommand(args) {
  const requirementId = flagValue(args, '--requirement') ?? null
  const policy = loadUserPolicy('policy/user.json')
  const requirements = requirementId
    ? policy.requirements.filter(r => r.id === requirementId)
    : policy.requirements
  if (requirements.length === 0) {
    writeJson({ ok: true, message: 'no requirements matched', requirements: [] })
    return
  }
  const instructions = requirements.map(_buildInstruction)
  writeJson({ ok: true, instructions })
}

function _buildInstruction(requirement) {
  return {
    requirement_id: requirement.id,
    event: requirement.event,
    requirement: requirement.requirement,
    skill: 'codex-hooks-compiler',
    note: 'feed this bundle to codex-hooks-compiler skill to produce trigger + feature + output rule data; compiler feedback is log information',
  }
}

function policyExplainCommand(args) {
  const [ruleId, ...rest] = args
  if (!ruleId) { usage(); return }
  const rulesRoot = flagValue(rest, '--rules') ?? 'policy/rules'
  const { rules } = loadRules({ rulesRoot })
  const rule = rules.find(r => r.id === ruleId)
  if (!rule) {
    process.stderr.write(`rule not found: ${ruleId}\n`)
    process.exit(1)
  }
  const source = rule.source ?? null
  writeJson({ id: rule.id, event: rule.event, source, trigger_paths: Object.keys(rule.trigger ?? {}), features: Object.keys(rule.feature ?? {}) })
}

function requirementsCommand(args) {
  const [sub, ...rest] = args
  const file = flagValue(rest, '--file') ?? 'policy/user.json'
  if (sub === 'validate') {
    loadUserPolicy(file)
    writeJson({ ok: true, file })
    return
  }
  if (sub === 'list') {
    const policy = loadUserPolicy(file)
    writeJson({
      file,
      version: policy.version,
      count: policy.requirements.length,
      requirements: policy.requirements.map(r => ({ id: r.id, event: r.event, requirement: r.requirement })),
    })
    return
  }
  if (sub === 'sync') {
    const report = buildUserRuleSyncReport({
      userPath: file,
      rulesRoot: flagValue(rest, '--rules') ?? 'policy/rules',
    })
    writeJson(report)
    if (!report.ok) process.exit(1)
    return
  }
  usage()
}

async function installCommand(args) {
  const plan = createInstallPlan(deployOptions(args))
  if (args.includes('--apply')) {
    const applied = applyInstallPlan(plan)
    writeJson({ ...plan, installation: { ...plan.installation, mode: 'applied', ...applied } })
    return
  }
  writeJson(plan)
}

function deployOptions(args) {
  return {
    target: flagValue(args, '--target') ?? 'project',
    rulesRoot: flagValue(args, '--rules') ?? 'policy/rules',
    profilePath: flagValue(args, '--profile') ?? undefined,
    logPath: flagValue(args, '--log') ?? undefined,
    command: flagValue(args, '--command') ?? undefined,
  }
}

function logOptions(args) {
  return {
    logPath: flagValue(args, '--log') ?? 'hooks.jsonl',
    tail: Number(flagValue(args, '--tail') ?? 20),
  }
}

function flagValue(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

function parseFailClosed(flag, configValue) {
  if (flag === 'true') return true
  if (flag === 'false') return false
  return configValue ?? true
}

function parseDryRun(flag, configRuntime) {
  if (flag === 'true') return true
  if (flag === 'false') return false
  return configRuntime === 'dry-run'
}

function writeJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function usage() {
  process.stderr.write([
    'usage: codex-hooks hook [--rules <path>] [--profile <path>] [--config <path>] [--log <path>] [--fail-closed true|false] [--dry-run true|false]',
    '       codex-hooks run <input.json> [...same flags]',
    '       codex-hooks events',
    '       codex-hooks policy requirements list|validate|sync [--file policy/user.json] [--rules policy/rules]',
    '       codex-hooks policy compile [--rules <p>] [--profile <p>] [--out <file>]',
    '       codex-hooks policy build [--requirement <id>]',
    '       codex-hooks policy explain <rule-id> [--rules <p>]',
    '       codex-hooks logs   [--log hooks.jsonl] [--tail 20]',
    '       codex-hooks status [--log hooks.jsonl] [--tail 1000]',
    '       codex-hooks render-hooks [--rules <p>] [--profile <p>] [--log <p>] [--command <cmd>]',
    '       codex-hooks doctor  [--target project|user] [--rules <p>] [--log <p>]',
    '       codex-hooks install [--target project|user] [--rules <p>] [--log <p>] [--apply]',
    '',
  ].join('\n'))
  process.exit(2)
}
