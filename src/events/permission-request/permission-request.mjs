import { applyRule } from '../../core/transition.mjs'
import { loadOfficialSchema, ensureValid } from '../../core/load.mjs'
import { instanceId } from '../_shared/instance-id.mjs'

const KEBAB = 'permission-request'
const OUTPUT_ACTIONS = Object.freeze(["allow","deny","block","stop"])
const FULL_ACCESS_MESSAGE = 'User action required: switch Codex to full access mode (permission_mode=bypassPermissions). Then codex-hooks can manage tool permissions with local rules.'

export const meta = Object.freeze({
  id: KEBAB,
  wire_name: 'PermissionRequest',
  input_schema: 'schema/api/openai-codex/generated/permission-request.command.input.schema.json',
  output_schema: 'schema/api/openai-codex/generated/permission-request.command.output.schema.json',
  output_actions: OUTPUT_ACTIONS,
  event: KEBAB,
  actions: OUTPUT_ACTIONS,
})

export async function handle(rawInput, rules, options = {}) {
  const sduSchema = loadOfficialSchema(KEBAB, 'input')
  ensureValid(rawInput, sduSchema, `${KEBAB}.sdu`)

  if (!isFullAccessMode(rawInput)) {
    const output = permissionDecisionOutput('deny', FULL_ACCESS_MESSAGE)
    const pduSchema = loadOfficialSchema(KEBAB, 'output')
    ensureValid(output, pduSchema, `${KEBAB}.mode-gate-output`)
    return {
      event: { instance: { id: instanceId(rawInput), event_name: KEBAB } },
      fired_rule_id: null,
      output,
    }
  }

  const eventRules = permissionTransitions(rules, rawInput)
    .sort((a, b) => (a.rule.priority ?? 100) - (b.rule.priority ?? 100) || a.rule.id.localeCompare(b.rule.id))


  let value = null
  let firedRuleId = null
  for (const { rule, input, mapOutput } of eventRules) {
    if (rule.enabled === false || rule.enabled === 'test') continue
    const result = applyRule(rule, input)
    if (result !== null && result !== undefined) {
      value = mapOutput(result)
      if (value === null || value === undefined) continue
      firedRuleId = rule.id
      break
    }
  }

  const ret = {
    event: { instance: { id: instanceId(rawInput), event_name: KEBAB } },
    fired_rule_id: firedRuleId ?? null,
    output: null,
  }

  if (value !== null && value !== undefined) {
    const pduSchema = loadOfficialSchema(KEBAB, 'output')
    ensureValid(value, pduSchema, `${KEBAB}.pdu`)
    ret.output = value
  }

  return ret
}

function isFullAccessMode(rawInput) {
  return rawInput?.permission_mode === 'bypassPermissions'
}

function permissionTransitions(rules, rawInput) {
  const own = rules
    .filter(rule => rule.event === KEBAB)
    .map(rule => ({ rule, input: rawInput, mapOutput: value => value }))
  const preToolUseInput = projectPreToolUseInput(rawInput)
  const projected = rules
    .filter(rule => rule.event === 'pre-tool-use')
    .map(rule => ({ rule, input: preToolUseInput, mapOutput: mapPreToolUseOutput }))
  return [...own, ...projected]
}

function projectPreToolUseInput(rawInput) {
  return {
    ...rawInput,
    hook_event_name: 'PreToolUse',
    tool_use_id: `permission-request:${rawInput.turn_id ?? rawInput.session_id ?? 'unknown'}`,
  }
}

function mapPreToolUseOutput(output) {
  const permissionDecision = output?.hookSpecificOutput?.permissionDecision
  const reason = output?.hookSpecificOutput?.permissionDecisionReason
    ?? output?.reason
    ?? output?.stopReason
    ?? output?.systemMessage

  if (permissionDecision === 'deny' || output?.decision === 'block' || output?.continue === false) {
    return permissionDecisionOutput('deny', reason)
  }
  if (permissionDecision === 'allow' || output?.decision === 'approve') {
    return permissionDecisionOutput('allow', reason)
  }
  return null
}

function permissionDecisionOutput(behavior, message) {
  const decision = { behavior }
  if (typeof message === 'string' && message !== '') decision.message = message
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision,
    },
  }
}
