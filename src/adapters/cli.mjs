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
import { DEFAULT_HOOK_STATE_PATH } from '../status/hook-state.mjs'
import { describe as describeTool, list as listTools, renderHelp as renderToolsHelp } from '../tools/index.mjs'
import {
  buildUserRuleSyncReport,
  loadUserPolicy,
  removeUserRequirement,
  setRequirementEnabled,
  setUserRequirement,
  writeUserRuleProjectionSync,
} from '../policy/user.mjs'

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
  if (command === 'tools') return toolsCommand(rest)
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
  const statePath = flagValue(rest, '--state') ?? config?.state?.path ?? DEFAULT_HOOK_STATE_PATH
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
      result = await runHook(input, { rulesRoot, profilePath, failClosed, dryRun, statePath })
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
  if (sub === 'verify-command') return policyVerifyCommand(rest)
  const rulesRoot = flagValue(rest, '--rules') ?? 'policy/rules'
  const profilePath = flagValue(rest, '--profile') ?? undefined
  if (sub === 'compile') {
    if (args.includes('--write') || flagValue(rest, '--user')) {
      const result = writeUserRuleProjectionSync({
        userPath: flagValue(rest, '--user') ?? 'policy/user.json',
        rulesRoot: flagValue(rest, '--out') ?? rulesRoot,
      })
      writeJson(result)
      if (!result.ok) process.exit(1)
      return
    }
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
  const [id] = rest
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
  if (sub === 'set') {
    if (!id) { usage(); return }
    const result = setUserRequirement({
      userPath: file,
      id,
      event: flagValue(rest, '--event') ?? undefined,
      requirement: flagValue(rest, '--requirement') ?? undefined,
      enabled: parseOptionalBoolean(flagValue(rest, '--enabled')),
    })
    writeJson({ ok: true, file, requirement: result })
    return
  }
  if (sub === 'enable' || sub === 'disable') {
    if (!id) { usage(); return }
    const result = setRequirementEnabled({ userPath: file, id, enabled: sub === 'enable' })
    writeJson({ ok: true, file, requirement: result })
    return
  }
  if (sub === 'remove') {
    if (!id) { usage(); return }
    const result = removeUserRequirement({ userPath: file, id })
    writeJson({ ok: true, file, removed: result })
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

async function policyVerifyCommand(args) {
  const event = flagValue(args, '--event') ?? 'pre-tool-use'
  const command = flagValue(args, '--command')
  const expected = flagValue(args, '--expect')
  if (!command || !expected) { usage(); return }
  if (event !== 'pre-tool-use') {
    throw new TypeError('policy verify-command currently supports --event pre-tool-use only')
  }
  const input = {
    cwd: process.cwd(),
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.4',
    permission_mode: 'bypassPermissions',
    session_id: 'policy-verify-command',
    tool_input: { command },
    tool_name: 'Bash',
    tool_use_id: 'policy-verify-tool',
    transcript_path: null,
    turn_id: 'policy-verify-turn',
  }
  const result = await runHook(input, {
    rulesRoot: flagValue(args, '--rules') ?? 'policy/rules',
    profilePath: flagValue(args, '--profile') ?? undefined,
    statePath: flagValue(args, '--state') ?? undefined,
    failClosed: false,
  })
  const actual = decisionFromOutput(result.output)
  const ok = actual === expected
  writeJson({ ok, expected, actual, fired_rule_id: result.fired_rule_id, output: result.output })
  if (!ok) process.exit(1)
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

function toolsCommand(args) {
  const [sub, ...rest] = args
  if (sub === 'list') {
    return writeJson(listTools({
      adapter: flagValue(rest, '--adapter') ?? undefined,
      status: flagValue(rest, '--status') ?? undefined,
      type: flagValue(rest, '--type') ?? undefined,
    }))
  }
  if (sub === 'describe') {
    const [id] = rest
    if (!id) { usage(); return }
    return writeJson(describeTool(id))
  }
  if (sub === 'help' || !sub) {
    process.stdout.write(renderToolsHelp({ adapter: flagValue(rest, '--adapter') ?? 'cli' }))
    return
  }
  usage()
}

function deployOptions(args) {
  return {
    target: flagValue(args, '--target') ?? 'project',
    rulesRoot: flagValue(args, '--rules') ?? 'policy/rules',
    profilePath: flagValue(args, '--profile') ?? undefined,
    logPath: flagValue(args, '--log') ?? undefined,
    statePath: flagValue(args, '--state') ?? undefined,
    command: flagValue(args, '--command') ?? undefined,
  }
}

function logOptions(args) {
  return {
    logPath: flagValue(args, '--log') ?? 'logs/codex-hooks.jsonl',
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

function parseOptionalBoolean(flag) {
  if (flag == null) return undefined
  if (flag === 'true') return true
  if (flag === 'false') return false
  throw new TypeError('expected boolean flag value true|false')
}

function decisionFromOutput(output) {
  if (output == null) return 'allow'
  if (output.decision === 'block') return 'block'
  if (output.hookSpecificOutput?.permissionDecision === 'deny') return 'block'
  if (output.hookSpecificOutput?.decision?.behavior === 'deny') return 'deny'
  return 'allow'
}

function writeJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function usage() {
  process.stderr.write([
    'usage: codex-hooks hook [--rules <path>] [--profile <path>] [--config <path>] [--log <path>] [--state <path>] [--fail-closed true|false] [--dry-run true|false]',
    '       codex-hooks run <input.json> [...same flags]',
    '       codex-hooks events',
    '       codex-hooks tools list [--adapter cli|hook|mcp|web] [--type event|feature|fn|system|help] [--status implemented|target|roadmap|hidden|deprecated]',
    '       codex-hooks tools describe <id>',
    '       codex-hooks tools help [--adapter cli|hook|mcp|web]',
    '       codex-hooks policy requirements list|validate|sync [--file policy/user.json] [--rules policy/rules]',
    '       codex-hooks policy requirements set <id> --event <event> --requirement <text> [--enabled true|false] [--file policy/user.json]',
    '       codex-hooks policy requirements enable|disable|remove <id> [--file policy/user.json]',
    '       codex-hooks policy compile [--rules <p>] [--profile <p>] [--out <file>]',
    '       codex-hooks policy compile --user policy/user.json --out policy/rules --write',
    '       codex-hooks policy verify-command --event pre-tool-use --command <text> --expect allow|block|deny [--rules <p>] [--state <p>]',
    '       codex-hooks policy build [--requirement <id>]',
    '       codex-hooks policy explain <rule-id> [--rules <p>]',
    '       codex-hooks logs   [--log logs/codex-hooks.jsonl] [--tail 20]',
    '       codex-hooks status [--log logs/codex-hooks.jsonl] [--tail 1000]',
    '       codex-hooks render-hooks [--rules <p>] [--profile <p>] [--log <p>] [--state <p>] [--command <cmd>]',
    '       codex-hooks doctor  [--target project|user] [--rules <p>] [--log <p>]',
    '       codex-hooks install [--target project|user] [--rules <p>] [--log <p>] [--apply]',
    '',
  ].join('\n'))
  process.exit(2)
}
