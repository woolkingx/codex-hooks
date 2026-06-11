import { applyRuleWithEffects } from '../../core/transition.mjs'
import { loadOfficialSchema, ensureValid } from '../../core/load.mjs'
import { loadHookState, saveHookState } from '../../status/hook-state.mjs'
import { instanceId } from '../_shared/instance-id.mjs'

const KEBAB = 'pre-tool-use'
const OUTPUT_ACTIONS = Object.freeze(["allow","ask","deny","block","context"])
const FULL_ACCESS_MESSAGE = 'User action required: switch Codex to full access mode (permission_mode=bypassPermissions). Then codex-hooks can enforce tool safety locally.'

export const meta = Object.freeze({
  id: KEBAB,
  wire_name: 'PreToolUse',
  input_schema: 'schema/api/openai-codex/generated/pre-tool-use.command.input.schema.json',
  output_schema: 'schema/api/openai-codex/generated/pre-tool-use.command.output.schema.json',
  output_actions: OUTPUT_ACTIONS,
  event: KEBAB,
  actions: OUTPUT_ACTIONS,
})

export async function handle(rawInput, rules, options = {}) {
  const sduSchema = loadOfficialSchema(KEBAB, 'input')
  ensureValid(rawInput, sduSchema, `${KEBAB}.sdu`)

  if (rawInput.permission_mode !== 'bypassPermissions') {
    const output = {
      decision: 'block',
      reason: FULL_ACCESS_MESSAGE,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: FULL_ACCESS_MESSAGE,
      },
    }
    ensureValid(output, loadOfficialSchema(KEBAB, 'output'), `${KEBAB}.permission-mode-output`)
    return {
      event: { instance: { id: instanceId(rawInput), event_name: KEBAB } },
      fired_rule_id: null,
      output,
    }
  }

  const eventRules = rules
    .filter(r => r.event === KEBAB)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  const hookState = options.statePath ? loadHookState(options.statePath) : null
  const featureContext = hookState ? { hookState } : {}

  let value = null
  let firedRuleId = null
  let commit = null
  for (const rule of eventRules) {
    if (rule.enabled === false || rule.enabled === 'test') continue
    const result = applyRuleWithEffects(rule, rawInput, featureContext)
    if (result !== null && result !== undefined) {
      value = result.output
      commit = result.commit
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
    if (commit) {
      commit()
      if (options.statePath && hookState) saveHookState(options.statePath, hookState)
    }
    ret.output = value
  }

  return ret
}
