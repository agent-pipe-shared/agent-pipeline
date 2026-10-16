---
schema: pipeline.backlog-item.v1
id: pipeline.licensing-outlook-states-a-zero-price-today
type: documentation
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 (licensing tile): before the 0.7.0 release, replace the vague 'future commercial use may require payment' outlook with an explicit 0 EUR price today, including internal use inside a commercial company; keep the option of different terms for future versions. Not part of the local Alfred candidate."
sprint: none
done_when: manual
---

# The licensing outlook should state a zero price today

## Description

`README.md` (the "Beta licensing outlook" block, and its German reader aid
below the DE marker) and `docs/licensing.md` section "Possible future
commercial-use terms (informational)" tell readers that a future version
"may require payment for commercial use". The license itself (SUL-1.0 with
the Agent-Pipeline Additional Permission) already grants royalty-free use,
including internal business use inside a commercial company; only monetizing
Agent-Pipeline itself needs a separate agreement. The vague outlook reads
less fair and more deterring than the actual terms.

## Proposal

Replace the outlook in both places with wording to this effect (final text
to be reviewed before release; this is not legal advice):

> Price today: 0 EUR for personal use and for internal business use,
> including inside a commercial company. Monetizing Agent-Pipeline itself
> (sale, paid hosting or SaaS, white-label use, embedding in a paid product,
> commercial redistribution) requires a separate agreement. Personal,
> non-commercial use stays free of charge, also in future versions. Future
> versions may introduce a fee for use by companies; copies already received
> keep the license they came with.

`LICENSE`, `LICENSE-DOCS` and the Additional Permission stay unchanged. The
PO intends to keep the option of a fee for companies using a future
version, and commits that personal use stays free (PO statement 2026-10-16).

## Acceptance

- README (English and its German reader aid) and `docs/licensing.md` state
  the 0 EUR price today with the scope above, state that personal use stays
  free in future versions, and limit any possible future fee to company use.
- No license file changes; no statement contradicts the current SUL-1.0
  terms.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
