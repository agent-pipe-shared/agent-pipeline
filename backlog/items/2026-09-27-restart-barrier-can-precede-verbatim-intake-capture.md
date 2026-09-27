---
schema: pipeline.backlog-item.v1
id: pipeline.restart-barrier-can-precede-verbatim-intake-capture
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Codex/WSL greenfield review B5, 2026-09-27: a restart card summarized the original input while the intake checkpoint's materialInput was reported empty."
sprint: none
done_when: manual
---

# A restart barrier can be reached before the verbatim user input is captured

## Description

The greenfield run reports that a 14,110-byte original request was absent
from `materialInput` when Codex restarted. The next session recovered it from
the earlier transcript and then used `intake-capture-apply`. The current
consumer design input proves eventual capture, but does not independently
prove why the pre-restart checkpoint was empty. This is a recurrence candidate
after earlier closed restart/consumption items, so a live boundary test is
required before selecting a fix.

## Triggering situation

The 2026-09-27 Codex greenfield restart before design-input generation.

## Affected artifact

`resume-hint.mjs`, `onboarding-continuity.mjs` intake capture, Codex
SessionStart hint, and onboarding restart-barrier actions.

## Proposal

Reproduce the exact route from first user request through the returned
restart barrier and inspect the checkpoint before restarting. If the barrier
can precede a verified verbatim chunk, make capture a precondition or return
one typed in-session capture action. Preserve the original bytes once, with
digest readback; a summary remains orientation only.

## Acceptance

- A real Codex restart test begins with a multi-kilobyte user request and
  proves the exact material chunk exists before the first restart barrier.
- The resumed session reads the same digest without transcript hunting or
  duplicate user questions.
- If the reported sequence cannot be reproduced, record the actual root
  cause and distinguish user/agent action order from storage failure.

## Triage

