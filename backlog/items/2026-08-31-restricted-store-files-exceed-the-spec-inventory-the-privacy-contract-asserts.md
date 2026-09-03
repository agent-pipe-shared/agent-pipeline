---
schema: pipeline.backlog-item.v1
id: pipeline.restricted-store-files-exceed-the-spec-inventory-the-privacy-contract-asserts
type: defect
owner: pipeline
status: open
created: 2026-08-31
source: "Independent Critic privacy-sweep review (F1), specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md, candidate 4defe09ece85721747f039036356ef80aed1b084"
sprint: nova-b
done_when: manual
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

## 2026-09-03 — the premise was re-measured and the routes are now costed

Dispatch `NVA-B-PRIVINV-1` produced a decision package and changed no contract.
It is at
`backlog/evidence/2026-09-03-nva-b-privinv-1-restricted-store-inventory-routes.md`
(`c9a8ba24`). Nothing under `specs/`, `plugins/` or `governance/` was touched:
both bound documents refuse writes, correctly, and a dispatch quietly amending a
blocking privacy contract so it matches the tree again would be the wrong reflex.

**The premise still holds, verified rather than inherited.** Against HEAD:
`spec.md` and `design/privacy-review.md` are byte-unchanged since candidate
`4defe09`, all three named files still exist, and `human-decision-attribution`
still has zero hits in the Spec. A sweep for restricted-store files added since
that candidate found six new files and none of them restricted-store — so the
inventory gap is exactly the three originally named, neither larger nor smaller.

**The routes differ by gate, not by effort**, which is what decides feasibility:

1. Amend the Spec inventory — PO only; `spec.md` is `authority: true` and
   immutable, so it needs the `feature-package-reconcile` ceremony.
2. Relocate the implementation into the already-inventoried
   `human-governance-decision` files — Elephant-implementable with no lifecycle
   ceremony, but genuinely multi-file: the kernel keys on the exact schema
   string (`governance-event.mjs:171,180`) and `guard-maintenance-window.mjs:262`
   lists the file by literal path in a trust-anchored allowlist.
3. Narrow rule 11's own claim to what the design can guarantee — mechanically
   cheapest, mutable-class, but the content decision is squarely the PO's, and it
   is the only route that reopens the stale privacy sign-off recorded in F2.

No route is recommended over another; that call is the PO's.

**The observation worth more than the fix.** Both occurrences were authorized,
tracked work. The control is not failing to catch unauthorized changes — it is
failing to keep its own inventory current against legitimate increments, so its
failure mode is "asserts something false about conforming work". Nothing enforces
rule 11 mechanically: no guard, hook or test compares restricted-store files on
disk against the §§7.3–7.4 table, and both occurrences were found only because a
commissioned Critic happened to grep for a module name. Detection latency has
been one full release cycle, twice.

Its truth therefore decays with every authorized increment, while the artifact
that must be re-edited to restore it sits behind the heaviest gate in the system.
An enumeration-based control has its maintenance cost highest exactly where its
accuracy matters most — which is a structural reason to expect this recurrence
again, whichever route is chosen. The contrast is drawn in the same document: the
kernel's `storageProfile` check is a predicate evaluated on every event, and does
not decay the way a table a human must remember to update does.

**Flagged, unresolved:** `specs/sprint-phoenix-epic/lifecycle.json` records
`state: "draft"` although the epic is described as closed in `docs/state.md`, in
this item, and in the Critic review. It does not change route 1's gate, which
fires on `mutability` rather than `state`, but it is a discrepancy in a
digest-bound record. Separately, whether any already-persisted
`restricted-machine-local` record encodes the file path rather than only the
schema string was not checked; if it does, route 2 costs more than stated.
