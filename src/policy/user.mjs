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

export function writeUserPolicy(policy, relativePath = 'policy/user.json') {
  ensureSchemaValid(policy, schemaRefs.userPolicy(), relativePath)
  ensureUniqueRequirementIds(policy.requirements, relativePath)
  const file = rootPath(relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(policy, null, 2)}\n`)
  return loadUserPolicy(relativePath)
}

export function setUserRequirement({ userPath = 'policy/user.json', id, event, requirement, enabled } = {}) {
  const policy = loadUserPolicy(userPath)
  const index = policy.requirements.findIndex(item => item.id === id)
  const current = index === -1 ? {} : policy.requirements[index]
  const next = {
    ...current,
    id,
    event: event ?? current.event,
    requirement: requirement ?? current.requirement,
  }
  if (enabled !== undefined) next.enabled = enabled
  if (index === -1) policy.requirements.push(next)
  else policy.requirements[index] = next
  writeUserPolicy(policy, userPath)
  return next
}

export function setRequirementEnabled({ userPath = 'policy/user.json', id, enabled } = {}) {
  const policy = loadUserPolicy(userPath)
  const requirement = policy.requirements.find(item => item.id === id)
  if (!requirement) throw new TypeError('requirement not found: ' + id)
  requirement.enabled = enabled
  writeUserPolicy(policy, userPath)
  return requirement
}

export function removeUserRequirement({ userPath = 'policy/user.json', id } = {}) {
  const policy = loadUserPolicy(userPath)
  const index = policy.requirements.findIndex(item => item.id === id)
  if (index === -1) throw new TypeError('requirement not found: ' + id)
  const [removed] = policy.requirements.splice(index, 1)
  writeUserPolicy(policy, userPath)
  return removed
}

export function rulePathForRequirement(requirement, { rulesRoot = 'policy/rules' } = {}) {
  return path.join(rulesRoot, requirement.event, requirement.id + '.rule.json').split(path.sep).join('/')
}

export function writeUserRuleProjectionSync({ userPath = 'policy/user.json', rulesRoot = 'policy/rules' } = {}) {
  const before = buildUserRuleSyncReport({ userPath, rulesRoot })
  const updatedRules = []
  const removedOrphans = []

  for (const item of before.requirements) {
    if (item.state !== 'enabled-mismatch') continue
    const ruleFile = rootPath(item.rule_path)
    const rule = readJson(item.rule_path)
    rule.enabled = item.requirement_enabled
    fs.writeFileSync(ruleFile, `${JSON.stringify(rule, null, 2)}\n`)
    updatedRules.push(item.rule_path)
  }

  for (const item of before.orphan_rules) {
    fs.rmSync(rootPath(item.rule_path), { force: true })
    removedOrphans.push(item.rule_path)
  }

  const report = buildUserRuleSyncReport({ userPath, rulesRoot })
  return {
    ok: report.ok,
    user_path: userPath,
    rules_root: rulesRoot,
    updated_rules: updatedRules,
    removed_orphans: removedOrphans,
    report,
  }
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
