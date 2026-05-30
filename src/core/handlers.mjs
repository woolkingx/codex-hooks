const loaders = Object.freeze({
  'permission-request':  () => import('../events/permission-request/permission-request.mjs'),
  'post-compact':        () => import('../events/post-compact/post-compact.mjs'),
  'post-tool-use':       () => import('../events/post-tool-use/post-tool-use.mjs'),
  'pre-compact':         () => import('../events/pre-compact/pre-compact.mjs'),
  'pre-tool-use':        () => import('../events/pre-tool-use/pre-tool-use.mjs'),
  'session-start':       () => import('../events/session-start/session-start.mjs'),
  'stop':                () => import('../events/stop/stop.mjs'),
  'subagent-start':      () => import('../events/subagent-start/subagent-start.mjs'),
  'subagent-stop':       () => import('../events/subagent-stop/subagent-stop.mjs'),
  'user-prompt-submit':  () => import('../events/user-prompt-submit/user-prompt-submit.mjs'),
})

const WIRE_TO_KEBAB = {
  PermissionRequest:  'permission-request',
  PostCompact:        'post-compact',
  PostToolUse:        'post-tool-use',
  PreCompact:         'pre-compact',
  PreToolUse:         'pre-tool-use',
  SessionStart:       'session-start',
  Stop:               'stop',
  SubagentStart:      'subagent-start',
  SubagentStop:       'subagent-stop',
  UserPromptSubmit:   'user-prompt-submit',
}

const KEBAB_TO_WIRE = Object.fromEntries(Object.entries(WIRE_TO_KEBAB).map(([w, k]) => [k, w]))

export function kebabFromWire(wireName) {
  return WIRE_TO_KEBAB[wireName] ?? wireName
}

export function wireFromKebab(kebab) {
  return KEBAB_TO_WIRE[kebab] ?? kebab
}

export async function loadHandler(eventName) {
  const key = loaders[eventName] ? eventName : kebabFromWire(eventName)
  const loader = loaders[key]
  if (!loader) return null
  const module = await loader()
  return { handle: module.handle, meta: module.meta }
}

export function listEvents() {
  return Object.keys(loaders)
}
