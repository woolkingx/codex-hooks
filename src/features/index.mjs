import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'
import * as bashCommand from './bash-command/bash-command.mjs'

const FEATURES = Object.freeze({
  [bashCommand.name]: {
    evaluate: bashCommand.evaluate,
    inputPaths: bashCommand.inputPaths,
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

export function evaluateFeature(name, config, input) {
  const feature = FEATURES[name]
  if (!feature) throw new TypeError(`feature-not-found: ${name}`)
  return feature.evaluate(config, input)
}
