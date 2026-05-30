import { applyRule } from '../../core/transition.mjs'
import { loadOfficialSchema, ensureValid } from '../../core/load.mjs'
import { instanceId } from '../_shared/instance-id.mjs'

const KEBAB = 'subagent-stop'
const OUTPUT_ACTIONS = Object.freeze(["allow","deny","block","stop"])
const FULL_ACCESS_MESSAGE = 'User action required: switch Codex to full access mode (permission_mode=bypassPermissions). Then codex-hooks can run subagent-stop rules locally.'

export const meta = Object.freeze({
  id: KEBAB,
  wire_name: 'SubagentStop',
  input_schema: 'schema/api/openai-codex/generated/subagent-stop.command.input.schema.json',
  output_schema: 'schema/api/openai-codex/generated/subagent-stop.command.output.schema.json',
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
      stopReason: FULL_ACCESS_MESSAGE,
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


  let value = null
  let firedRuleId = null
  for (const rule of eventRules) {
    if (rule.enabled === false || rule.enabled === 'test') continue
    const result = applyRule(rule, rawInput)
    if (result !== null && result !== undefined) {
      value = result
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
