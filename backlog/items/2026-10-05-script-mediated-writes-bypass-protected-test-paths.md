---
schema: pipeline.backlog-item.v1
id: pipeline.script-mediated-writes-bypass-protected-test-paths
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation, ALFRED-NULSWEEP dispatch, Agent-Pipeline Claude/Windows session 2026-10-05: an agent-authored node script rewrote a protected test file."
sprint: alfred
done_when: manual
---

# Script-mediated writes bypass the protected test paths

## Description

During a codemod (ALFRED-NULSWEEP, 2026-10-05) an agent-authored `node scratch/<x>.mjs`
rewrote the protected `plugins/pipeline-core/hooks/guard-testpath.test.mjs` (TP-2).
`guard-testpath` sees Edit/Write tool calls and direct shell commands, but not files
written by a script the agent runs. The agent's own revert attempt was correctly refused
(`GUARD-TESTPATH-SHELL`); the PO reverted the file by hand.

Security class: a protected-path guard that holds for one write channel and not for
another is not a guard.

## Acceptance

- Protected-path integrity is enforced independent of the write channel, for example a
  PostToolUse or pre-commit integrity check of the protected paths against their pins
  after any Bash/PowerShell call that runs node.
- A regression test reproduces the codemod shape (a node script that rewrites a
  protected test file) and shows it is detected or refused.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
