# Compiler Log Fixture

A requirement can fail compilation when the current event rule schema or helper set cannot express the requested behavior. That failure is log information. It is not a persistent separate gap file artifact and it has no schema root.

**Requirement in `policy/user.json`:**

```json
{
  "id": "semantic-secret-detection",
  "event": "pre-tool-use",
  "requirement": "Block commands that appear to expose secrets even if the command name is not on a static deny list."
}
```

**Why compilation fails:** The requirement asks for semantic classification, but the current deterministic rule schema only supports trigger path values, admitted feature modules, literal output data, and official output validation.

**Log information:**

```json
{
  "type": "compile.gap",
  "requirement_id": "semantic-secret-detection",
  "event": "pre-tool-use",
  "message": "Current deterministic rule schema cannot express semantic secret detection without an approved feature module."
}
```

**Resolution path:** Add or admit a module-owned feature first, then regenerate `policy/rules/pre-tool-use/semantic-secret-detection.rule.json`.
