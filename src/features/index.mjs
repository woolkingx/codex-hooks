import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'
import * as bashCommand from './bash-command/bash-command.mjs'
import * as blockFirstTime from './block-first-time/block-first-time.mjs'

const FEATURES = Object.freeze({
  [bashCommand.name]: {
    evaluate: bashCommand.evaluate,
    inputPaths: bashCommand.inputPaths,
  },
  [blockFirstTime.name]: {
    evaluate: blockFirstTime.evaluate,
    inputPaths: blockFirstTime.inputPaths,
    commit: blockFirstTime.commit,
  },
})

export function knownFeatureNames() {
  return Object.keys(FEATURES)
}

export function validateFeatureConfig(name, config, label = `feature.${name}`) {
  if (!FEATURES[name]) throw new TypeError(`feature-not-found: ${name}`)
  return ensureSchemaValid(config, schemaRefs.feature(name), label)
}

export function featureInputPaths(name, config) {
  const feature = FEATURES[name]
  if (!feature) throw new TypeError(`feature-not-found: ${name}`)
  return feature.inputPaths(config)
}

export function evaluateFeature(name, config, input, context = {}) {
  const feature = FEATURES[name]
  if (!feature) throw new TypeError(`feature-not-found: ${name}`)
  return feature.evaluate(config, input, context)
}

export function featureCommit(name, config, input, context = {}) {
  const feature = FEATURES[name]
  if (!feature) throw new TypeError(`feature-not-found: ${name}`)
  if (!feature.commit) return null
  return () => feature.commit(config, input, context)
}
