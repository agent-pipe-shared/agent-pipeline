---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-writes-production-code-directly-without-a-goldfish-dispatch
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Live observation of the PO's private Claude+Pipeline 0.5.4 happy-path test run (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
closed_at: 2026-08-18
closure_repository: self
closure_commit: c75d73fd670648e475f01b9272ef0e2098abce8b
closure_evidence: backlog/items/2026-08-09-elephant-writes-production-code-directly-without-a-goldfish-dispatch.md
---

# The Elephant wrote a project's production code directly, with no Goldfish dispatch at any point in the session

## What happened

In the observed Claude+Pipeline happy-path run, the deliverable's script,
markup, and style files were all written directly by the main (Elephant)
agent turn via `Write` tool calls. The session transcript shows no `Agent`/
`Task` tool invocation anywhere — the only two matches for a Goldfish
reference in the whole transcript are the static, harness-injected
agent-listing and skill-listing metadata (which always name the available
subagent types), not an actual dispatch. This is a direct violation of this
Pipeline's own operating model: implementation is Goldfish's job; the
Elephant orchestrates, briefs, and reviews evidence, but does not author
production code itself (`docs/operating-model.md` §2, this repo's own
`CLAUDE.md` "Dispatch from the template, never freehand" rule, ADR-0015
self-application).

Unlike the guardrail/security-diff self-application review this repo
enforces on itself, a consumer project's ordinary implementation work
currently has no equivalent automated, technical check that would have
caught this at the time it happened — it surfaced only because the PO
happened to notice it live.

## Direction

Not yet root-caused why the bootstrap/kickoff flow let the Elephant proceed
straight to direct implementation instead of dispatching Goldfish for the
first real implementation step. Two angles worth investigating together:

1. Whether the shipped skill guidance states the dispatch requirement
   clearly and forcefully enough at exactly the point a fresh kickoff
   reaches its first implementation step (as opposed to stating it
   elsewhere and trusting recall).
2. Whether any technical signal (e.g. a check on whether the current
   `activeFeature`/phase has had at least one dispatch recorded before
   production-file writes accumulate) could make this class of drift
   detectable without turning every Elephant `Write` call into a blocked
   action — the Elephant legitimately writes non-production artifacts
   (docs, backlog items, specs) directly throughout this repo's own
   sessions, so any check would need to distinguish those from an actual
   consumer project's deliverable code.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Same bundled decision as
  `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`.
  This item's own direction 2 (a technical detection signal on whether the
  active feature/phase had ≥1 dispatch before production writes accumulate)
  is effectively what the PO declined — that is a guard, and the decision
  was to not build one. Direction 1 (clearer skill guidance at the exact
  point a fresh kickoff reaches its first implementation step) was not
  asked about separately and is not decided either way.
- **Rationale:** PO, 2026-08-11: "D" on the grouped enforcement-mechanism
  cluster — make re-dispatch cheap instead of gating self-implementation
  detection.
- **Assignment (if accepted):** Unassigned, folds into the same design pass
  as the mp22 item. Direction 1 (documentation/guidance wording) remains a
  candidate cheap fix but is not yet approved — flag separately if picked
  up. Sprint: Alfred — matches its confirmed scope ("mechanical governance,
  measurable rigor, and control integrity",
  `docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17 amendment)
  precisely.
- **Date:** 2026-08-11

### PO-decision implementation, 2026-08-18 (wave 3, dispatch NVA-W3-6)

PO decision (2026-08-18, decision #9): option A — implement Direction 1
from this item's own text (the cheap, non-technical clarification: clearer
skill guidance on when an Elephant may write directly). Documentation-only;
no new detection/enforcement code, matching the already-recorded 2026-08-11
decision that declined Direction 2.

**What changed:** `plugins/pipeline-core/skills/pipeline-start/SKILL.md`,
"Gate authority and autonomous continuation" section. That section already
carried the Goldfish-dispatch requirement (from the earlier
`2026-08-09-consumer-projects-have-no-goldfish-dispatch-requirement-for-implementation.md`
closure, `backlog/evidence/2026-08-10-goldfish-dispatch-instruction-closure.md`),
but two paragraphs after the sentence that first authorizes continuing into
implementation ("scoped edits, focused tests, ... are agent work") — exactly
the ambiguous phrase an Elephant reads at the point a fresh kickoff reaches
its first implementation step, and exactly the gap this item's Direction 1
named. The fix moves a bolded, one-sentence disambiguation ("Agent work"
here means Goldfish-dispatched work ... not this Elephant session writing
the diff itself") directly onto that sentence, and reframes the existing
"not a technically guard-enforced rule" caveat as a reason to read the
paragraph carefully in the moment, rather than as an implicit invitation
that skipping it is low-stakes. The `epic`/`feature`-dispatch-required vs.
`mini`-profile-exception rule itself is unchanged — this is wording/ordering
only, not a new criterion.

**Evidence:** `node --test
plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs` —
1/1 pass, exit 0 (the gating test's pinned literal substrings, including the
`scoped edits, focused tests, state\nreadback, ...` line-wrap it asserts on,
are unchanged). `node --test
harness/scripts/check-consumer-safe-paths.test.mjs` — 9/9 pass, exit 0
(template-recommended additional check for any `plugins/pipeline-core/`
touch). `SKILL.md` byte size after the change: 19,706 (bootstrap budget:
45,000, `plugins/pipeline-core/lib/bootstrap-payload-budget.mjs`). Commit
`42233f21` on branch `nova-w3-elephant-writes-production-code-directly-without`.

**Not touched, and why:** `roles/elephant.md`'s EL-01 exception text (the
Elephant-may-implement-directly carve-out is worded there as the strict
quantitative "OM §3.3 stage-0 fast-path" — ≤2 files, ≤~25 diff lines, no
architecture/schema/etc. change — while this SKILL.md section's exception
is worded as the coarser "`mini`-profile plan"). Whether those two
exception definitions actually name the same set of cases is a real open
question, but resolving it is a definitional/technical question outside
"cheap, non-technical clarification" and outside this decision's scope —
flagging it here rather than silently reconciling it. `templates/prompts/
elephant-kickoff.md`'s own "You write no production code" bullet (§2) is
unchanged; it is one bullet among ~20 read once at session start, and the
Direction-1 gap this decision closes is specifically about the point kickoff
*reaches* implementation, which is the SKILL.md section edited above, not
the kickoff template's opening contract list.

### Closure

Both of this item's own Direction angles are now resolved: Direction 2 (a
technical enforcement/detection signal) was declined by the PO on
2026-08-11 (bundled with the mp22 item's decision) and no work was ever
authorized for it; Direction 1 (clearer skill guidance at the point of
first implementation) is implemented above. No part of this item's own
stated scope remains open. Status set to `closed`.
