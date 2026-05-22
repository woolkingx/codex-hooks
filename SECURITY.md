# Security Policy

## Supported Versions

Only the latest `0.1.x` commit is supported before a stable release.

## Reporting a Vulnerability

Open a private security advisory on GitHub when available, or contact the repository owner directly.

Include:

- Affected event and rule file.
- Hook input that triggers the issue.
- Expected official output.
- Actual output or failure mode.
- Whether fail-closed behavior blocked or allowed the action.

## Runtime Safety Contract

- Hook input and output are validated against official Codex schemas.
- Rule files validate against event-owned rule schemas.
- Unsupported rule data should fail closed for blocking-capable events.
- Log redaction must be configured for environments that write sensitive hook inputs.
