---
schema: pipeline.backlog-item.v1
id: pipeline.identical-lifecycle-argv-must-have-shell-lane-parity
type: defect
owner: pipeline
status: open
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — the Claude Windows run observed an exact `--push-approval signature` lifecycle invocation rejected as Bash parse-unsupported but admitted via PowerShell."
source: "evidence/pipeline-analysis-claude-session-2026-09-13.md §5.2 and §10.3."
---

# Identical typed lifecycle commands do not have equivalent Bash and PowerShell admission

A single logical Node invocation crossed the PowerShell lane but was refused by
the Bash lane as `GUARD-PARSE-UNSUPPORTED`.  This causes retry-by-lane-switch,
not an intentional security boundary.  It is especially costly during
signature-mode setup, where a retry can invalidate candidate-bound work.

## Direction

Capture the exact rejected argv and sanitized tool envelopes on Windows, then
make both grammar adapters accept it or have the producer return one explicitly
supported lane.  Do not broaden either parser from prose or shell-string
similarity alone.

## Acceptance criteria

- The same typed lifecycle argv has the same allow/refuse result on every lane
  that the runner presents as interchangeable.
- Deliberately different shell syntax remains parsed according to its actual
  dialect and cannot gain an unrelated admission.
- Regression fixtures include the captured Windows invocation.

