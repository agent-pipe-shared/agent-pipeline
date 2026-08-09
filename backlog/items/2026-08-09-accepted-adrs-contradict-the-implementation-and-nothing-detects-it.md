---
schema: pipeline.backlog-item.v1
id: pipeline.accepted-adrs-drift-from-implementation-undetected
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Found on 2026-08-09 by two determination-first dispatches (PHX-ADR40, PHX-ADR38) sent to restore text the 0.5.2 merge audit reported as lost. Neither restored anything: both found the text had been deliberately superseded, and both surfaced this drift instead. Verified independently at source by the Elephant before filing."
due: 2026-09-08
---

# Accepted ADRs contradict the implementation, and nothing detects it

## Description

Two accepted decision records currently state things the code contradicts. Neither
disagreement is caught by any check, because **nothing in the verify gate compares an ADR
against the behaviour it decides**. Both were found only because a dispatch was sent to
restore adjacent text and refused, and both would otherwise have kept reading as
authoritative indefinitely.

This item is the class, not the two instances. The instances are evidence that the class
has no detector.

## Triggering situation

`PHX-ADR40` and `PHX-ADR38`, 2026-08-09. Each was briefed to restore a section the
non-code merge audit (`evidence/phx-audit2.md`) reported as lost. Each established that
the text was superseded rather than dropped, changed nothing, and reported a drift its
own investigation had exposed.

## Affected artifact

**Instance 1 — `docs/adr/0040-advisor-consent-and-readonly-bash.md:18`** states that
missing or declined consent leaves advisory off. `setup.mjs:232` says *"Advisor export is
repository-scoped and enabled by default"* and `:235` that *"only an explicit decline
keeps Advisory off"*. `setup.test.mjs:123` pins the implementation's wording, so the test
suite actively defends the side that contradicts the ADR. **Missing** consent and
**declined** consent are the same case in the ADR and different cases in the code.

**Instance 2 — `docs/adr/0038-runner-neutral-advisory-v3.md:3`** records
*"session-trigger semantics superseded"*. ADR-0047, which supersedes it, claims
*"session-trigger **and mandatory-receipt** semantics"*. The narrower note was written in
the same commit (`b856139`, 2026-07-29) that removed the mandatory-receipt clause — so
the status line understates, by one term, exactly what that commit did.

**The missing detector:** `harness/scripts/` carries checks for doc contracts, citation
targets, observation governance, skill-versus-spec coverage and artifact topology. None
compares a decision record's assertions against the code implementing them, and ADR status
lines are not validated against the claims of the ADRs that supersede them.

## Proposal

Two decisions first, both PO-owned, because each is a governance question rather than a
repair:

1. For instance 1: does the ADR text change to enabled-by-default, or does the
   implementation change to match the ADR? A registered test defends the implementation,
   so this is not a documentation edit either way.
2. For instance 2: amend the status line to match ADR-0047's own claim, or establish that
   the narrower wording was deliberate.

Then the class. A cheap first detector is achievable without semantic analysis: **validate
that every ADR status line naming a superseding ADR agrees with what that ADR claims to
supersede.** Instance 2 is exactly that shape and would have been caught mechanically.
Instance 1 is harder and probably needs a named-anchor convention rather than inference —
worth scoping only after the two decisions land.

**Deliberately not proposed:** a general ADR-versus-code checker. Tonight produced four
findings where a plausible-looking repair would have made the repository worse, and a
detector that guesses at semantic agreement would generate exactly that class of false
positive.

## Related

- `2026-08-07-no-check-validates-prose-section-citations.md` — the same absence one layer
  down; that gap now has `harness/scripts/check-critic-contract-citations.mjs`, which is
  the precedent for a narrow, honest detector over a broad guessing one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
