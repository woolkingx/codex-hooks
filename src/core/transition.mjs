import { resolveInput, validateInputPath } from './path.mjs'
import { evaluateFeature, featureCommit, featureInputPaths, validateFeatureConfig } from '../features/index.mjs'

export { resolveInput }

export function applyRule(rule, input, context = {}) {
  return applyRuleWithEffects(rule, input, context)?.output ?? null
}

export function applyRuleWithEffects(rule, input, context = {}) {
  if (!triggerMatches(rule.trigger ?? {}, input)) return null
  const featureResult = featuresMatch(rule.feature ?? {}, input, context)
  if (!featureResult.matched) return null
  return {
    output: rule.output ?? null,
    commit: () => {
      const results = []
      for (const effect of featureResult.effects) results.push(effect())
      return results
    },
  }
}

export function validateRuleTransition(rule, { sduSchema, label = 'rule' } = {}) {
  for (const inputPath of Object.keys(rule.trigger ?? {})) {
    validateInputPath(inputPath, sduSchema, `${label}.trigger.${inputPath}`)
  }
  for (const [featureName, config] of Object.entries(rule.feature ?? {})) {
    validateFeatureConfig(featureName, config, `${label}.feature.${featureName}`)
    for (const inputPath of featureInputPaths(featureName, config)) {
      validateInputPath(inputPath, sduSchema, `${label}.feature.${featureName}.${inputPath}`)
    }
  }
  return rule
}

function triggerMatches(trigger, input) {
  for (const [inputPath, expected] of Object.entries(trigger)) {
    if (!deepEqual(resolveInput(input, inputPath), expected)) return false
  }
  return true
}

function featuresMatch(feature, input, context) {
  const effects = []
  for (const [featureName, config] of Object.entries(feature)) {
    if (!evaluateFeature(featureName, config, input, context)) return { matched: false, effects: [] }
    const effect = featureCommit(featureName, config, input, context)
    if (effect) effects.push(effect)
  }
  return { matched: true, effects }
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a).sort()
    const bKeys = Object.keys(b).sort()
    return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && deepEqual(a[key], b[key]))
  }
  return false
}
