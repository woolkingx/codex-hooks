import crypto from 'node:crypto'

export function instanceId(input) {
  return crypto.createHash('sha256').update(JSON.stringify({
    event: input.hook_event_name,
    session: input.session_id,
    turn: input.turn_id ?? null,
    tool_use: input.tool_use_id ?? null,
    cwd: input.cwd,
  })).digest('hex').slice(0, 16)
}
