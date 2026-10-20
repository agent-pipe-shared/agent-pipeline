---
schema: pipeline.backlog-item.v1
id: pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "PO statement 2026-10-07 (chat) during the Alfred revision-5 approval: critic, advisor and readiness reviewer all run in design, which is not the intended flow."
sprint: alfred
done_when: manual
---

# The design phase stacks Critic rounds, a mandatory Advisor course and a readiness reviewer instead of one review before the PO decision

## Description

For one design revision (Alfred revision 5) the agent ran four Critic rounds,
then had to run a mandatory Advisor course stage (with an exception rationale
because the Claude Advisor route is unavailable) and an independent readiness
reviewer before `present-plan`. The PO states the intended design flow is:

1. create the design;
2. consult an Advisor on specific topics only when needed (on demand, not a
   mandatory course stage);
3. finalize the content;
4. one review;
5. PO approval (the single signature for design -> implementation).

The current driver/coordinator instead makes the Advisor stage and a separate
readiness review mandatory gates and leaves Critic rounds unbounded in
practice (see `2026-10-07-critic-round-cap-and-delta-scope-are-not-enforced`).

## Acceptance

- The implementation-phase driver (design-course coordinator, `present-plan`
  preconditions) implements exactly the PO flow above: Advisor on demand,
  one review step, then the PO decision.
- No mandatory Advisor stage and no exception rationale when no Advisor was
  needed.
- Critic and readiness are not two separate review gates for the same design;
  there is one review (with at most one delta follow-up per QG-13).
- The happy path for one design revision needs one PO signature (approval) and
  no further PO acts.

## Observed 2026-10-17: the one design review does not check decision continuity (major for 0.7.0)

Source: PO-supplied forensic analysis of the Codex WSL greenfield run, finding P1-3
(confirmed).

- The approved Spec carried nine technical decisions; the project had only
  `docs/adr/.gitkeep`, no ADR and no decision-register entry (EL-04). The architecture map
  and fitness model were materialized, but no fitness check ever ran against a candidate.

Added acceptance (0.7.0, major), inside the one review step above, no extra gate:

- The single design review assesses each foundational decision of the Spec for
  significance and requires, before the PO approval, either an ADR/register reference or a
  recorded non-significance reason.
- A materialized fitness model is executed as a candidate check at the implementation
  boundary; a model that never ran is reported, not counted as qualified.

## Recorded minors from the same analysis (not 0.7.0 acceptance conditions)

- P2: after plan approval `docs/state.md` of the consumer project still said design, no
  implementation and approval pending; an older owner checkpoint still said
  blocked/unverified after a later green run; a test artifact named `.json` was plain text.
  Proposal: an automatically refreshed entry state with the actual next executable step,
  superseded markers on old checkpoints, artifacts that match their file format.
- Transparency: the PO had to ask what the agent was doing, where parallel work is visible,
  and to continue. Proposal: visible status of active owners and autonomous continuation
  of technical recovery.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted for the next local 0.7.0 candidate (PO 2026-10-07).
- **Rationale:** PO-defined flow; current flow costs hours and signatures.
- **Assignment (if accepted):** Alfred implementation, design-course coordinator / driver.
- **Date:** 2026-10-07

## Observed 2026-10-20: Codex WSL greenfield, second run (two blockers and a major)

Source: PO-supplied forensic analysis of a Codex greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_codex2_20261020.md`), installed `pipeline-core`
`0.7.0+codex.20261020064459.a8ddf85`, chat approval mode. The run never reached the first
implementation dispatch. The PO puts the report's blockers and majors into the next candidate (D64).

- Blocker, provenance: the canonical receipt names `reviewer.model = sonnet` while the requested
  route was another model at high effort. `design-review-receipt.mjs` reads the `model:` line of
  `agents/critic.md` instead of binding the actual review dispatch, so a role profile is recorded
  as the executing model.
- Blocker, criterion format: the reviewed and approved Spec used a four-column acceptance table the
  dispatch parser does not support. Only dispatch preparation found it (`CAC-CRITERION-UNSUPPORTED`,
  after `DBG-CRITERION-ID` for a leading-zero id). The correction changed no criterion text, but
  invalidated the approval and forced another review round.
- Major, review chain: the context report counted two technical rounds while the presented receipt
  said `initial`, round 1, with no predecessor, because the earlier chain was held back privately as
  unpublishable. After the format correction `unreviewedSourceDelta` could not be used with that
  chain and `present-plan` refused (`DCC-REVIEW-RECEIPT-BINDING`), so the PO was asked for a review
  budget exception.

Added acceptance (0.7.0, D64):

- The receipt records the reviewer role, the requested route and the observed execution identity
  separately, binds the concrete review dispatch, and records `unknown` when no execution was
  observed; it never copies an agent profile's model as the executed model.
- Before `present-plan`, every acceptance criterion of the Spec is located with the same parser
  that registration and dispatch use; an unsupported shape or id is refused there with the
  supported shapes named. A purely formal re-rendering whose criterion texts are byte-identical
  needs no new content review round.
- A report is sanitized before the first canonical receipt; the receipt chain binds the original
  and the published digest and counts spent rounds independently of file names, so a delta after a
  formal correction is admitted without a budget exception.
