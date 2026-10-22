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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — The original incident was on Windows; no counted native-Windows run of the pin exists
  Run the codemod-shape regression pin (node script rewriting a protected test file is detected or refused) natively through cmd.exe on a /mnt/d clone. The pin itself is small; the surrounding guard suites are the multi-hour part, so run only the pin file.
