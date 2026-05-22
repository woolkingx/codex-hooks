import fs from 'node:fs'
import path from 'node:path'
import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'
import { listRuleFiles, readJson, rootPath } from '../core/load.mjs'

export function loadUserPolicy(relativePath = 'policy/user.json') {
  const file = rootPath(relativePath)
  if (!fs.existsSync(file)) {
    throw new TypeError('user policy not found: ' + relativePath)
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  ensureSchemaValid(data, schemaRefs.userPolicy(), relativePath)
  ensureUniqueRequirementIds(data.requirements, relativePath)
  return data
}

export function rulePathForRequirement(requirement, { rulesRoot = 'policy/rules' } = {}) {
  return path.join(rulesRoot, requirement.event, requirement.id + '.rule.json').split(path.sep).join('/')
}

export function buildUserRuleSyncReport({ userPath = 'policy/user.json', rulesRoot = 'policy/rules' } = {}) {
  const policy = loadUserPolicy(userPath)
  const requirementKeys = new Set(policy.requirements.map(requirementKey))
  const requirements = policy.requirements.map(requirement => requirementRuleState(requirement, rulesRoot))
  const rules = listRuleFiles(rulesRoot).map(file => runtimeRuleState(file, requirementKeys))
  const orphanRules = rules.filter(item => item.state === 'orphan')
  const ok = requirements.every(item => item.state === 'ok') && rules.every(item => item.state === 'ok')
  return {
    ok,
    user_path: userPath,
    rules_root: rulesRoot,
    requirements,
    rules,
    orphan_rules: orphanRules,
  }
}

function ensureUniqueRequirementIds(requirements, label) {
  const seen = new Set()
  for (const requirement of requirements) {
    if (seen.has(requirement.id)) throw new TypeError(label + ': duplicate requirement id ' + requirement.id)
    seen.add(requirement.id)
  }
}

function requirementRuleState(requirement, rulesRoot) {
  const rulePath = rulePathForRequirement(requirement, { rulesRoot })
  const base = {
    id: requirement.id,
    event: requirement.event,
    rule_path: rulePath,
  }
  const file = rootPath(rulePath)
  if (!fs.existsSync(file)) return { ...base, state: 'missing' }
  const loaded = readRuleFile(rulePath)
  if (loaded.state !== 'ok') return { ...base, state: loaded.state, reason: loaded.reason }
  const rule = loaded.rule
  if (rule.id !== requirement.id) return { ...base, state: 'id-mismatch', rule_id: rule.id ?? null }
  if (rule.event !== requirement.event) return { ...base, state: 'event-mismatch', rule_event: rule.event ?? null }
  const requirementEnabled = normalizedEnabled(requirement)
  const ruleEnabled = normalizedEnabled(rule)
  if (ruleEnabled !== requirementEnabled) {
    return { ...base, state: 'enabled-mismatch', requirement_enabled: requirementEnabled, rule_enabled: ruleEnabled }
  }
  try {
    ensureSchemaValid(rule, schemaRefs.eventRule(requirement.event), rulePath)
  } catch (error) {
    return { ...base, state: 'invalid-rule', reason: error.message }
  }
  return { ...base, state: 'ok' }
}

function runtimeRuleState(rulePath, requirementKeys) {
  const base = { rule_path: rulePath }
  const loaded = readRuleFile(rulePath)
  if (loaded.state !== 'ok') return { ...base, state: loaded.state, reason: loaded.reason }
  const rule = loaded.rule
  const pathInfo = rulePathInfo(rulePath)
  const withRule = { ...base, id: rule.id ?? null, event: rule.event ?? null }
  if (!rule.id || !rule.event) return { ...withRule, state: 'invalid-rule', reason: 'missing rule id or event' }
  if (rule.id !== pathInfo.id) return { ...withRule, state: 'path-id-mismatch', expected_id: pathInfo.id }
  if (rule.event !== pathInfo.event) return { ...withRule, state: 'path-event-mismatch', expected_event: pathInfo.event }
  try {
    ensureSchemaValid(rule, schemaRefs.eventRule(rule.event), rulePath)
  } catch (error) {
    return { ...withRule, state: 'invalid-rule', reason: error.message }
  }
  if (!requirementKeys.has(ruleKey(rule))) return { ...withRule, state: 'orphan' }
  return { ...withRule, state: 'ok' }
}

function readRuleFile(rulePath) {
  try {
    return { state: 'ok', rule: JSON.parse(fs.readFileSync(rootPath(rulePath), 'utf8')) }
  } catch (error) {
    return { state: 'invalid-json', reason: error.message }
  }
}

function requirementKey(requirement) {
  return requirement.event + '/' + requirement.id
}

function ruleKey(rule) {
  return rule.event + '/' + rule.id
}

function normalizedEnabled(record) {
  return record.enabled ?? true
}

function rulePathInfo(rulePath) {
  const normalized = rulePath.split(path.sep).join('/')
  const event = path.basename(path.dirname(normalized))
  const file = path.basename(normalized)
  const id = file.endsWith('.rule.json') ? file.slice(0, -'.rule.json'.length) : file
  return { event, id }
}
