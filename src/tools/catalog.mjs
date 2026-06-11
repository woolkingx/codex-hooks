const eventNames = [
  'permission-request',
  'post-compact',
  'post-tool-use',
  'pre-compact',
  'pre-tool-use',
  'session-start',
  'stop',
  'subagent-start',
  'subagent-stop',
  'user-prompt-submit',
]

const eventTitles = {
  'permission-request': 'PermissionRequest event transition',
  'post-compact': 'PostCompact event transition',
  'post-tool-use': 'PostToolUse event transition',
  'pre-compact': 'PreCompact event transition',
  'pre-tool-use': 'PreToolUse event transition',
  'session-start': 'SessionStart event transition',
  stop: 'Stop event transition',
  'subagent-start': 'SubagentStart event transition',
  'subagent-stop': 'SubagentStop event transition',
  'user-prompt-submit': 'UserPromptSubmit event transition',
}

function eventTool(id) {
  return {
    type: 'event',
    status: 'implemented',
    value: {
      id,
      title: eventTitles[id],
      owner: { kind: 'event', id, path: `src/events/${id}/` },
      schema: {
        input: `schema/api/openai-codex/generated/${id}.command.input.schema.json`,
        rule: `src/events/${id}/${id}.rule.schema.json`,
        output: `schema/api/openai-codex/generated/${id}.command.output.schema.json`,
      },
      adapters: ['hook', 'cli'],
      adapter_status: { hook: 'implemented', cli: 'implemented' },
      gates: ['GATE-EVENT-TRIPLE-01', 'GATE-TOOLS-OBJECT-TREE-01'],
    },
    method: {
      describe: { kind: 'describe' },
      invoke: { kind: 'execute', target: 'src/core/run.mjs' },
      verify: { kind: 'verify' },
    },
  }
}

function featureTool(id, title) {
  return {
    type: 'feature',
    status: 'implemented',
    value: {
      id,
      title,
      owner: { kind: 'feature', id, path: `src/features/${id}/` },
      schema: { feature: `src/features/${id}/schema.json` },
      adapters: ['cli', 'mcp', 'web'],
      adapter_status: { cli: 'implemented', mcp: 'roadmap', web: 'roadmap' },
      gates: ['GATE-FEATURE-MODULE-01', 'GATE-TOOLS-OBJECT-TREE-01'],
    },
    method: {
      describe: { kind: 'describe' },
      verify: { kind: 'verify' },
    },
  }
}

function fnTool(id, title, target, examples = []) {
  return {
    type: 'fn',
    status: 'implemented',
    value: {
      id,
      title,
      owner: { kind: 'fn', id, path: target },
      adapters: ['cli', 'mcp', 'web'],
      adapter_status: { cli: 'implemented', mcp: 'roadmap', web: 'roadmap' },
      gates: ['GATE-OWNER-INTERFACE-01', 'GATE-TOOLS-OBJECT-TREE-01'],
      examples,
    },
    method: {
      describe: { kind: 'describe' },
      invoke: { kind: 'execute', target },
      verify: { kind: 'verify' },
    },
  }
}

function systemTool(id, title, schemaPath) {
  return {
    type: 'system',
    status: 'implemented',
    value: {
      id,
      title,
      owner: { kind: 'system', id, path: schemaPath },
      schema: { data: schemaPath },
      adapters: ['cli', 'mcp', 'web'],
      adapter_status: { cli: 'implemented', mcp: 'roadmap', web: 'roadmap' },
      gates: ['GATE-DATA-ONTOLOGY-01', 'GATE-TOOLS-OBJECT-TREE-01'],
    },
    method: {
      describe: { kind: 'describe' },
      verify: { kind: 'verify' },
    },
  }
}

function helpTool(id, title, methodKind, target) {
  return {
    type: 'help',
    status: 'implemented',
    value: {
      id,
      title,
      owner: { kind: 'help', id, path: 'src/tools/index.mjs' },
      schema: { tools: 'schema/tools.schema.json' },
      adapters: ['cli', 'mcp', 'web'],
      adapter_status: { cli: 'implemented', mcp: 'roadmap', web: 'roadmap' },
      gates: ['GATE-TOOLS-OBJECT-TREE-01', 'GATE-OWNER-INTERFACE-01'],
    },
    method: {
      [methodKind]: { kind: methodKind, target },
    },
  }
}

export const TOOLS_CATALOG = Object.freeze({
  version: '0.1.0',
  tools: {
    events: Object.freeze(Object.fromEntries(eventNames.map(id => [id, eventTool(id)]))),
    features: Object.freeze({
      'bash-command': featureTool('bash-command', 'Bash command matcher'),
      'block-first-time': featureTool('block-first-time', 'Block-first-time state gate'),
    }),
    fn: Object.freeze({
      'policy.requirements.list': fnTool('policy.requirements.list', 'List policy requirements', 'src/policy/user.mjs', ['codex-hooks policy requirements list']),
      'policy.requirements.sync': fnTool('policy.requirements.sync', 'Check policy requirement to rule sync', 'src/policy/user.mjs', ['codex-hooks policy requirements sync']),
      'policy.compile': fnTool('policy.compile', 'Compile policy rules', 'src/policy/user.mjs', ['codex-hooks policy compile --user policy/user.json --out policy/rules --write']),
      'runtime.run': fnTool('runtime.run', 'Run one hook input through runtime', 'src/core/run.mjs', ['codex-hooks run test/fixtures/pre-tool-use-bash-rm.json']),
      'runtime.verify-command': fnTool('runtime.verify-command', 'Verify one command through PreToolUse runtime', 'src/core/run.mjs', ['codex-hooks policy verify-command --event pre-tool-use --command "rm -rf target" --expect block']),
      'deploy.render-hooks': fnTool('deploy.render-hooks', 'Render Codex hook configuration', 'src/deploy/index.mjs', ['codex-hooks render-hooks']),
      'deploy.doctor': fnTool('deploy.doctor', 'Run deployment doctor checks', 'src/deploy/index.mjs', ['codex-hooks doctor']),
      'deploy.install': fnTool('deploy.install', 'Create or apply an install plan', 'src/deploy/index.mjs', ['codex-hooks install --target project']),
      'logs.read': fnTool('logs.read', 'Read runtime log tail', 'src/log/index.mjs', ['codex-hooks logs']),
      'status.read': fnTool('status.read', 'Read runtime status summary', 'src/status/index.mjs', ['codex-hooks status']),
    }),
    system: Object.freeze({
      config: systemTool('config', 'Runtime config data', 'schema/config.schema.json'),
      deploy: systemTool('deploy', 'Deploy result data', 'schema/deploy.schema.json'),
      log: systemTool('log', 'Runtime log data', 'schema/log.schema.json'),
      profile: systemTool('profile', 'Profile selection data', 'schema/profile.schema.json'),
      status: systemTool('status', 'Runtime status and hook-state data', 'schema/status.schema.json'),
      tools: systemTool('tools', 'External callable tool object tree', 'schema/tools.schema.json'),
    }),
    help: Object.freeze({
      'tools.help.list': helpTool('tools.help.list', 'List visible tool objects', 'list', 'src/tools/index.mjs'),
      'tools.help.describe': helpTool('tools.help.describe', 'Describe one tool object', 'describe', 'src/tools/index.mjs'),
      'tools.help.render': helpTool('tools.help.render', 'Render adapter help from tool objects', 'render', 'src/tools/index.mjs'),
    }),
  },
})
