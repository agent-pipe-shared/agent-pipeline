---
schema: pipeline.backlog-item.v1
id: pipeline.guard-reclassification-changed-what-a-signature-can-lift
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Critic round on the 2026-08-08 greenfield hardening block, finding F3, severity minor. Independently corroborated from the reviewing agent's own denial trajectory."
---

# A guard reclassification quietly changed which denials a human signature can lift

## What changed, and the effect nobody measured

Commit `88d316d` made `hasExternalOutputRedirect()` — the cross-repository
detector used for commands the closed grammar cannot parse — skip a
descriptor-2 redirect to the null device. As classification that is correct: a
stderr suppressor writes nothing outside the project, and the parseable branch of
the same function had exempted that shape since `2b56304`. The two had simply
drifted apart.

The effect that went unmeasured is not on the verdict but on **override
reachability**:

- `GUARD-CROSS-REPO-MUTATION` returns a bare refusal with no route.
- `GUARD-PARSE-UNSUPPORTED` routes through the grammar override planner, and on a
  consumed signed capability admits the command.
- The cross-repository check runs *before* the grammar branch and is not
  re-evaluated after a lift.

So an unparseable command whose only cross-repository signal was an external
redirect target moves from "never liftable" to "liftable by a signed human
override". No agent gains anything: the immediate verdict is unchanged, and the
commit's claim that nothing becomes admitted holds. What changed is what a human
with a private key can subsequently authorize.

## Why this is worth a decision rather than a silent acceptance

[ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) places
cross-repository-boundary targets explicitly outside the override's authority,
routing them to an external operator rather than to a signed capability. The
reclassification did not change that rule; it changed which commands fall under
it. That is a boundary moving without the decision that put it there being
revisited.

Two honest qualifications, both of which argue against treating this as severe:

1. The skip is structurally narrow — descriptor 2 only, null device only, judged
   per redirect. `2>audit.log`, `>/dev/null`, `&>/dev/null` and any second real
   redirect are untouched.
2. An identical command *without* the redirect was already liftable before this
   change. The general gap — redirect scanning being the only cross-repository
   detector for unparseable commands — is pre-existing. What this commit removed
   was one incidental non-overridable catch, not a designed protection.

The reason to record it anyway is that neither the commit prose nor its evidence
covers this axis. The differential measured `exitCode` and `code`, which is the
right instrument for "nothing becomes admitted" and silent on who may later admit
it.

## Direction, not a design

Not designed here. Two questions, and they are separable:

1. **Is the new reachability correct?** A stderr suppressor is not a
   cross-repository mutation, so arguably it should never have been in the
   non-liftable class and the reclassification restores the truth. If so, this
   item closes as accepted with the reasoning written down — which is itself the
   deliverable, since the current record contains no such reasoning.
2. **Should the differential measure reachability at all?** A guard-classification
   change today proves it admitted nothing. It does not prove it moved nothing
   between override classes. Adding that axis to the probe corpus would have
   caught this before review, and would catch the next one.

Question 2 is the one that generalises and is cheap; question 1 belongs to the
PO, because it is a judgement about how much a signature is allowed to reach.

## Triggering situation

Reviewed at commit `88d316d`; corroborated by the reviewing agent's own denials
during that review, which printed a complete signed-override route for one
command and a bare refusal for another.

## Related

- [ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) — the boundary in
  question, Decisions 3, 4 and 5.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the order
  that human gates must be usable, which argues *for* the new reachability rather
  than against it.
- `2026-08-08-a-maintenance-window-signature-is-voided-by-an-unrelated-file-write.md`
  — the other place where the signed-approval surface behaves in a way its
  decision record does not describe.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
