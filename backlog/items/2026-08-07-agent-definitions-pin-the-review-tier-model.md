---
schema: pipeline.backlog-item.v1
id: pipeline.agent-definitions-pin-the-review-tier-model
type: defect
owner: pipeline
status: closed
created: 2026-08-07
due: 2026-08-21
source: "Critic round 1 of the 0.5.3 candidate, 2026-08-07 — the Critic reported its own route violation from direct same-dispatch evidence; the cause was found in the shipped agent definitions afterwards."
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "08684e7874b79c04a44601c487f343be0dfaefa5"
closure_evidence: "backlog/items/2026-08-07-agent-definitions-pin-the-review-tier-model.md"
---

# Shipped agent definitions pin the review-tier model, so MP-07's mandatory escalation silently does not happen

## Description

`plugins/pipeline-core/agents/critic.md` and
`plugins/pipeline-core/agents/goldfish-deep.md` both carry `model: sonnet` in
their frontmatter. A per-dispatch model override takes precedence over that
frontmatter, so the pin is not wrong in itself — for an ordinary class-mittel
first pass it is the right default, and for `goldfish-deep` it is at least
arguable. What it is not is *safe by default* for the cases the policy singles
out.

MP-07 makes the higher-capability model at `max` **mandatory**, not preferred,
for ARCHITECTURE, GUARDRAIL and SECURITY diffs. A dispatch that does everything
else right — correct template, refs-only input, enumerated SHAs, T1 assurance
line, and the requested route named in the dispatch metadata exactly as the
template demands — still lands on the review tier unless the orchestrator
separately sets the override at the tool layer. The dispatch text saying
`claude-opus-5 at max` has no effect whatsoever on which model runs; it only
gives the agent something to compare itself against.

That is the same silent-inheritance failure mode CLAUDE.md's "Model discipline"
rule already closes at the dispatch layer — *"Subagents otherwise silently
inherit the session's model; that silent inheritance is the failure mode this
rule closes"* — reappearing one layer down at the agent-definition layer, where
the existing rule does not reach.

Two properties make this worse than an ordinary default:

1. **It fails silently in the direction of less scrutiny.** A guardrail review
   that should have been the highest tier runs at the review tier and returns a
   fluent, well-formed, plausible report. Nothing in the output is marked as
   degraded.
2. **The only thing that caught it was the Critic's own report-header
   requirement** — the rule making the Critic state the requested route and its
   own effective identity from direct evidence. Without that rule the round
   would have been indistinguishable from a compliant one. `goldfish-deep` has
   no equivalent self-report requirement, so the same pin there is currently
   uncaught by anything.

A second, smaller gap surfaced alongside it: the dispatch layer can set the
model identifier but has **no channel to set the effort level**, which therefore
inherits the dispatching session's rather than being pinned at `max` as MP-07
requires. Naming the effort in the dispatch text has the same non-effect as
naming the model.

## Triggering situation

Live during the 0.5.3 candidate review (2026-08-07). A T1 GUARDRAIL round was
dispatched with the requested route stated as `claude-opus-5 at max`. The Critic
opened its report with its effective identity as the review tier, quoting its
own runtime prompt as direct same-dispatch evidence, and named the mismatch as a
dispatch-compliance defect that "should be treated as reducing confidence in
this review's completeness". The round was re-run with an explicit override and
returned four major findings the first round did not have, two of them inside
the security mechanism under review — so the tier difference was not academic.

## Affected artifact

`plugins/pipeline-core/agents/critic.md` and
`plugins/pipeline-core/agents/goldfish-deep.md` (frontmatter `model:`), read
together with `policies/model-policy.md` MP-05/MP-07 and the CLAUDE.md "Model
discipline" bullet. The effort-channel gap is a property of the dispatch
mechanism rather than of any one file.

## Proposal

Not designed here. Candidates, explicitly not a commitment:

1. **Close it at the dispatch layer.** Extend the "Model discipline" rule so
   that naming the model in the dispatch text is explicitly *not* sufficient —
   the orchestrator must set the tool-layer override and record that it did.
   Cheapest, but it stays a discipline rule, and this incident is evidence that
   discipline rules get missed.
2. **Remove the frontmatter pin** so the agents inherit the session model.
   Trades one silent default for another in the opposite direction, and probably
   worse: an Elephant session at a high tier would make every trivial review
   expensive.
3. **Make the mismatch loud rather than preventable.** The Critic already knows
   its requested route and its effective identity. Require it to stop *before*
   substantive review when the two conflict and the dispatch declares an A/G/S
   criticality row, instead of reviewing and disclosing afterwards. Fail-closed,
   costs nothing when the route is correct, and depends on nothing the
   orchestrator has to remember. Extend the same self-report duty to
   `goldfish-deep`, which today has none.
4. Independent of the choice above: decide whether a T1 A/G/S round whose route
   cannot be evidenced may be used as a final gate at all. Today that is a
   judgment call made by whoever reads the report.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred. Re-verified 2026-08-17:
  `plugins/pipeline-core/agents/critic.md:4` and
  `plugins/pipeline-core/agents/goldfish-deep.md:4` both still carry
  `model: sonnet` — unresolved. The practical dispatch-layer mitigation
  already in effect (explicit `model`/`effort` overrides named at every
  Critic/goldfish-deep dispatch this session, per this repo's own
  "Model discipline" rule) is a workaround, not this item's fix.
- **Rationale:** this is exactly Sprint Alfred's confirmed scope — "Agent-first
  architecture, mechanical governance, measurable rigor, and control
  integrity" (`docs/adr/0043-post-go-live-sprint-model.md`'s 2026-08-17
  amendment) — and matches live Alfred issues `#104`/`#105`
  ("measurable default" / "deterministic minimum rigor floor"). Not blocking
  current Nova/Phoenix work: every T1 A/G/S dispatch this session has set the
  tool-layer override explicitly, so the silent-inheritance failure mode is
  currently avoided by discipline, not by design — acceptable to defer, not
  safe to ignore indefinitely.
- **Assignment (if accepted):** next available Alfred slot; the four
  candidate directions in this item's own Proposal are the design's starting
  point, not a pre-made choice.
- **Date:** 2026-08-17

### Phoenix checkout's own triage, 2026-08-18 (superseded by the closure below — Nova's fix had already landed by 2026-08-19)

- **Decision:** Deferred in Phoenix, not implemented here. The design
  question this item asks (candidate 3: a fail-closed route pre-check before
  substantive review, extended from Critic to `goldfish-deep`) has already
  been decided and proven out — but in the sibling Nova checkout, not this
  one.
- **Rationale:** The PO's standing instruction for this session was to do
  further Phoenix work "but only things not already solved in Nova, or
  already implemented there." Nova's `plugins/pipeline-core/agents/critic.md`
  carries a "Route pre-check before substantive review (A/G/S dispatches...)"
  block (commit `08684e78`, "fix(agents): stop A/G/S dispatches before review
  on an evidenced route mismatch") that is not on this branch — confirmed:
  `git merge-base --is-ancestor 08684e78 HEAD` exits 1 here, and Phoenix's own
  `critic.md` still jumps straight from the identity-disclosure line to
  `## Two-phase protocol` with no route pre-check. Porting that fix into
  Phoenix would be exactly the duplicate work the standing instruction asked
  to skip. The frontmatter model pin itself is unchanged by design in both
  repos (candidate 2, removing the pin, was deliberately not chosen).
- **Assignment (if accepted):** Not assigned in Phoenix. If Phoenix and Nova
  are ever reconciled/merged, porting Nova's `08684e78` (or re-deriving the
  same fix independently) closes this item; until then it stays open here as
  a known, deliberately-unported gap rather than a rediscovered one.
- **Date:** 2026-08-18

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** Nova's proven route pre-check (commit `08684e78`) ported into `critic.md`/`goldfish-deep.md` (commit `adc52efc`), content-identical port. A follow-up preimage-hash re-pin (commit `0dce39cb`) closed a downstream integrity-check gap the port itself introduced (disclosed, precedented re-pin per commit `7172a15b`).
- **Date:** 2026-08-19
