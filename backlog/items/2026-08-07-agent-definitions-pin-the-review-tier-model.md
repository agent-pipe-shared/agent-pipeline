---
schema: pipeline.backlog-item.v1
id: pipeline.agent-definitions-pin-the-review-tier-model
type: defect
owner: pipeline
status: open
created: 2026-08-07
due: 2026-08-21
source: "Critic round 1 of the 0.5.3 candidate, 2026-08-07 — the Critic reported its own route violation from direct same-dispatch evidence; the cause was found in the shipped agent definitions afterwards."
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
