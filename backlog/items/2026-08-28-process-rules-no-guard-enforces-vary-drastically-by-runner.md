---
schema: pipeline.backlog-item.v1
id: pipeline.unenforced-process-rules-vary-by-runner
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova-b
tracking: "Nova B"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
done_when: manual
---

# The rules no guard enforces are followed very differently by each runner — the rework limit failed by a factor of five

## The measurement

Same design document, same operating model, three runners:

| Rule | Claude | Agy | Codex |
| --- | --- | --- | --- |
| EL-10 rework limit (max 3) | 1 cycle | **14 cycles** | within limit |
| Dispatch records (EL-21/30) | 5, schema-complete | 15, **175-byte stubs, empty log** | 2, minimal |
| Tool budget | 3 of 4 dispatches over cap, self-reported | not reported | not reported |

Agy ran **14 rework rounds against a limit of 3** and nothing stopped it. Its own
report presents this as a virtue ("forced 14 iteration rounds, driving the
implementation to a professional standard") while the PO's assessment of the
result is the opposite: "was da mit so viel aufwand gebaut wurde, war echter
schrott". A runner cannot be relied on to notice it is looping.

## The pattern

Every rule that a guard enforces held across all three runners. Every rule that
lives only in briefing prose varied. The Claude run states the conclusion
plainly, and it matches this repository's own standing principle that a violated
rule needs a guard rather than another paragraph:

> die Regeln, die kein Guard hart durchsetzt (EL-10 Rework-Limit, EL-21/30
> Record-Schema, Tool-Budget), werden je nach Runner unterschiedlich gut befolgt.

## Complication that must be part of the fix

In Claude Code, PreToolUse guards **do not fire inside dispatched subagents**
(`2026-08-27-pretooluse-guards-do-not-fire-in-dispatched-subagents.md`) — so a
guard is not automatically available as the enforcement mechanism for a
per-dispatch rule. Antigravity does apply them. Any counter must therefore live
where it is observable on every runner: the orchestrator side, or the artifact
the dispatch leaves behind.

## Direction

- Enforce the current retry policy: at most one product retry and one
  environment reroute per work package, with a named blocker when the applicable
  allowance is exhausted or unavailable.
- Validate dispatch records against their schema at write time; a 175-byte stub
  should fail rather than persist.
- Replace the tool budget with a measured value, or stop presenting an
  unobserved briefing convention as a limit. Three of four Claude dispatches
  exceeded it and the fourth self-reported wrongly.

## Implementation evidence (2026-09-11)

Commit `58b0e36f` mechanically enforces the product side of the current policy at
the shared Continuity authority. The new `continuity-dispose-failure`
transition accepts a closed, digest-bound failure envelope and derives the
disposition through `review-economy`; callers cannot select the action or next
state. A successful product retry persists `productRetryCount: 1` in the
root-level `retryBudget`. Compare-and-swap validation carries that budget across
the course-blocker path and rejects attempts to reset it through a null queue or
a later queue reconstruction.

The same transition deliberately returns the typed
`CS-ENVIRONMENT-REROUTE-UNAVAILABLE` outcome for an otherwise eligible
environment reroute. That allowance must remain unavailable until the pipeline
has both trusted, persisted host attestation and a real route consumer; a
caller-supplied claim or a synthetic state transition would not prove that a
different environment was used.

This closes only the product-retry enforcement part of the defect. Dispatch
record validation at the write boundary and runner-neutral, measured tool-budget
enforcement remain open. The historical request to refuse a fourth generic
rework dispatch has been superseded by the stricter one-product-retry plus
one-environment-reroute policy; the table above remains the evidence that
prompt-only limits failed in the original test.

## Acceptance criteria

- A second product retry on the same package is refused through the shared
  Continuity authority on every runner, including after blocker and queue
  transitions.
- One environment reroute can be consumed only from trusted persisted host
  evidence by a real route consumer; until those capabilities exist, the
  transition fails closed with a typed unavailable result and no mutation.
- A dispatch record that does not satisfy its schema is rejected at write time.
- The budget is either counted or removed.
