---
schema: pipeline.backlog-item.v1
id: pipeline.no-durable-practice-for-mining-session-transcripts-for-happy-path-defects
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
source: "PO request, 2026-08-09: 'ergänze die Telemetrie daten der Sessions und werte detailliert ihre chat verläufe/transkripte aus um Fehler zu finden und den happy path zu optimieren' — issued alongside two real greenfield test sessions this same night that were mined ad hoc (two general-purpose forensic-analysis subagent dispatches, no reusable artifact produced)."
due: 2026-08-23
---

# Mining a runner's own session transcript for happy-path defects works, but is ad hoc every time

## What happened

This session, two full session transcripts (one Claude Code JSONL, three
Codex rollout JSONL files) were forensically mined for concrete defects by
hand-writing two bespoke `general-purpose` subagent briefings on the spot.
It worked well — every claim in both the PO's and the runner's own
self-reports was independently confirmed or corrected against exact
evidence (line numbers, exact error text, exact commands) — but the
technique itself (what to grep for, how to structure the report, which
claims to specifically verify) was reconstructed from scratch this time and
would be again next time.

## Why this is a real, recurring cost

The PO has now run multiple greenfield happy-path re-tests across sessions
(this one and at least one earlier round the same day). Each one surfaces
real, previously-undetected defects that only show up in a live run, not in
Full Verify. Mining these transcripts is clearly valuable — this exact
session's dispatch list (10+ concrete, evidence-backed fixes) came directly
from it — but redoing the investigative methodology from a blank page each
time is wasted effort, and increases the risk of missing a category of
finding that a more systematic pass would have structurally forced attention
to (e.g. always checking dispatch-discipline compliance, always diffing
docs against machine state, always counting escalation/friction events).

## Direction

Write down the reusable shape of this investigation as a durable reference
(e.g. a checklist or a Critic-review-style prompt template, analogous to
`templates/prompts/critic-review.md`) covering: what to grep for in a
runner's own transcript format (Claude Code JSONL vs. Codex rollout JSONL
differ), the standard categories worth specifically checking every time
(dispatch discipline / Elephant-vs-Goldfish, doc-vs-machine-state drift,
guard false-positives, human-terminal command safety, restart/context-loss
behavior, escalation/friction counts), and the report shape that makes
findings independently actionable (exact evidence, confirmed/partial/not-found
verdict per claim). This is a documentation/process artifact, not a code
change — scope it as its own small spec rather than bundling it into an
unrelated fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
