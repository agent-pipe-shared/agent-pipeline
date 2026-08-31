---
schema: pipeline.backlog-item.v1
id: pipeline.restricted-store-files-exceed-the-spec-inventory-the-privacy-contract-asserts
type: defect
owner: pipeline
status: open
created: 2026-08-31
source: "Independent Critic privacy-sweep review (F1), specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md, candidate 4defe09ece85721747f039036356ef80aed1b084"
sprint: nova-b
---

# Restricted-store files exceed the Spec inventory the privacy contract asserts

## Description

`specs/sprint-phoenix-epic/design/privacy-review.md` §3 rule 11 requires
restricted storage, schema discrimination, policy, operations, tests and
operator guidance to be implemented ONLY inside files already listed in bound
Spec §§7.3-7.4, and closes with "No separate restricted-store implementation
file is authorized by this design." Three restricted-store files at candidate
`4defe09` are absent from that inventory:

- `plugins/pipeline-core/lib/human-decision-attribution.mjs`
- `plugins/pipeline-core/lib/human-decision-attribution.test.mjs`
- `governance/schemas/human-decision-attribution.schema.json`

`spec.md:390-438` enumerates §§7.3-7.4 in full; `human-decision-attribution`
has zero hits across `spec.md`, `spec-revision-20260802.md` and
`design/architecture.md`. The module self-identifies as restricted storage at
`human-decision-attribution.mjs:3-15`.

This is the recurrence of the exact defect §3.11 was written to close — the
prior correction re-review FAILed partly because "five new restricted-store
files exceeded the Spec inventory". A blocking privacy contract asserting a
false inventory claim cannot be relied on by the next reviewer or auditor.

## Mitigating context

Both facts below were independently verified by the Critic, not inherited:

- The implementation itself is privacy-conservative: closed nine-key shape, no
  correlator fields, day-bucketed time, `restricted-machine-local` profile
  enforced in-kernel at `governance-event.mjs:180`.
- The build was an authorized, tracked increment —
  `backlog/items/2026-08-18-h-ac-11-restricted-profile-intake-record-is-design-increment-2.md`
  is `status: closed`, `closed_at: 2026-08-19`, sourced to a PO amendment of
  2026-08-17. So this is **contract drift, not rogue implementation** — but
  §3.11 is factually violated at the candidate and was never amended.

## Triggering situation

Commissioned Critic privacy sweep, 2026-08-31, before `nova`'s next push to
origin (`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`,
finding F1).

## Affected artifact

`specs/sprint-phoenix-epic/design/privacy-review.md` §3 rule 11;
`specs/sprint-phoenix-epic/spec.md` §§7.3-7.4.

## Proposal

The fix is NOT a code change: it is either amending Spec §§7.3-7.4 to list the
three files, or relocating the three files into an already-listed file. Both
routes require touching a digest-bound artifact of a closed epic
(`specs/sprint-phoenix-epic/lifecycle.json` binds a sha256 for `spec.md` and
for `design/privacy-review.md`), which is why the PO deferred this rather than
remediating during the 0.6.0 release: retroactively rewriting a closed epic's
authority record plus its digest index is a PO decision, not an Elephant one.

## PO decision, 2026-08-31

Disclosed and accepted unremediated for the 0.6.0 release. Remediation would
require retroactively rewriting a closed epic's digest-bound authority record
(`specs/sprint-phoenix-epic/lifecycle.json`), which is out of scope for this
release.
