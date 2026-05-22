import fs from 'node:fs'
import path from 'node:path'
import { ensureSchemaValid, schemaRefs } from '../core/schema-tree.mjs'
import { destinationFor, runDoctor } from './doctor.mjs'
import { renderHooksConfig } from './render-hooks.mjs'

export function createInstallPlan(options = {}) {
  const target = options.target ?? 'project'
  const doctorResult = runDoctor(options)
  const hookConfig = renderHooksConfig(options)
  const destination = destinationFor(doctorResult.environment, target)
  const record = {
    target,
    environment: doctorResult.environment,
    artifact: doctorResult.artifact,
    hook_config: hookConfig,
    validation: [
      {
        name: 'hook_config',
        status: 'pass',
        message: `rendered ${Object.keys(hookConfig.hooks).length} hook event entries`,
      },
    ],
    installation: {
      destination,
      format: 'hooks.json',
      mode: 'dry-run',
      backup: true,
      will_write: [destination],
    },
    doctor: doctorResult.doctor,
  }
  return validateDeployRecord(record)
}

export function validateDeployRecord(record) {
  return ensureSchemaValid(record, schemaRefs.system('deploy'), 'deploy')
}

export function applyInstallPlan(plan) {
  const destination = plan.installation?.destination
  if (!destination) throw new TypeError('install plan missing installation.destination')
  const dir = path.dirname(destination)
  fs.mkdirSync(dir, { recursive: true })
  let backup = null
  if (fs.existsSync(destination)) {
    backup = `${destination}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
    fs.copyFileSync(destination, backup)
  }
  const tmp = `${destination}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(plan.hook_config, null, 2))
  fs.renameSync(tmp, destination)
  return { written: destination, backup, bytes: fs.statSync(destination).size }
}
