# Rule Fixture — Trigger + Feature + Output

A complete `deny-rm` rule as runtime rule data. The `trigger` object declares input path values, `feature` declares module-owned feature data, and `output` declares official output data.

```json
{
  "id": "deny-rm",
  "event": "pre-tool-use",
  "priority": 50,
  "source": { "file": "policy/user.json", "requirement_id": "deny-rm" },
  "trigger": {
    "$.tool_name": "Bash"
  },
  "feature": {
    "bash-command": {
      "value": {
        "path": "$.tool_input.command",
        "name": "rm"
      }
    }
  },
  "output": {
    "decision": "block",
    "reason": "rm is disabled. Move files to .cleanup/ or .backup/.",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "rm is disabled."
    }
  }
}
```

**Key constraints:**

- `trigger` keys must exist in the event input schema.
- `feature.<name>` must be admitted by the event rule schema.
- `feature.<name>` value must validate against `src/features/<name>/schema.json`.
- `output` must validate against the event output schema.
- No matching rule returns `null` and writes no hook output.
