---
schema: pipeline.backlog-item.v1
id: pipeline.a-torn-audit-append-has-disabled-every-human-guard-override-since-august-20
type: defect
owner: pipeline
status: closed
created: 2026-09-02
sprint: nova-b
done_when: manual
source: "Measured live 2026-09-02 during a human-guard-override ceremony for a TP-3 edit: sign-intent succeeded, authorize-by-signature failed with HGO-AUDIT, and verify-audit fails identically with no ceremony in flight."
closed_at: 2026-09-12
closure_repository: self
closure_commit: 54a20d83a0501de98d522f7d7da7a829ccf16cc1
closure_evidence: backlog/evidence/2026-09-12-hgo-audit-repair-critic-round2.md
---

# A torn audit append has disabled every human-guard override since 2026-08-20

## The defect

`verifiedAuditEntries()` in `plugins/pipeline-core/lib/human-guard-override.mjs`
recomputes the audit head from the ledger and refuses when it disagrees. In this
repository it disagrees, and has since 2026-08-20:

- `audit.head.json` records `entries: 282`, mtime 19:32.
- `audit.jsonl` holds 283 lines, mtime 19:34.

Entry 283 is well formed and correctly chained — its `previousMac` equals the
head's `lastMac` — so the ledger is not tampered with. What happened is a torn
write: `appendAudit()` appended the entry and the head was never advanced to
cover it. The entry itself is a `denied` event from `2026-08-20T17:34:20.961Z`.

Every route that authenticates the ledger therefore fails closed. That is the
right behaviour for an audit chain it cannot verify. The defect is what it costs
and how little it says.

## What it costs

**The entire human-guard-override mechanism has been unavailable for thirteen
days**, in a repository whose push gate is `signature` mode and where protected
test paths have no in-session override. Nothing announced it.

Measured on 2026-09-02, in order:

1. An `Edit` to `harness/scripts/verify.mjs` was refused with TP-3, as expected.
   The refusal ended: *"No human override route is offered for this exact edit;
   the guard attempted to plan one. Reason: planning the route failed with
   code=HGO-AUDIT."*
2. The request was nevertheless seeded correctly, and
   `prepare-for-signature` produced a complete, valid ceremony — plan digest,
   intent digest, both copy-safe commands.
3. The PO ran `sign-intent` at an attended terminal and produced a real Ed25519
   proof.
4. `authorize-by-signature` failed with `HGO-AUDIT: audit ledger head
   authentication failed`. No capability was armed.
5. `verify-audit` fails identically with no ceremony in flight, confirming the
   fault is standing state, not the ceremony.

**A human signature was spent on a ceremony that could not possibly complete.**
Steps 2 and 3 both succeeded while the mechanism was already known-broken to the
code — step 1 had said so, in a line that reads as boilerplate.

The push-approval ceremony (`pipeline-state.mjs approve-push` /
`po-human-approval.mjs authorize-critical`) is a **different** mechanism and is
unaffected: two push approvals were produced and verified on 2026-09-01, after
the ledger broke.

## Direction

Three separate things, and the first is the important one.

1. **`prepare-for-signature` must not prepare a ceremony the ledger cannot
   complete.** It should authenticate the ledger first and refuse with the same
   `HGO-AUDIT` code, before any human is asked for a signature. A ceremony that
   can be prepared but never consumed converts a mechanical fault into a spent
   human credential.
2. **The append must be atomic**, or the head must be recoverable from the
   ledger without a human deciding to trust it. Today the head is a separate
   file written after the ledger, with a window between them.
3. **A repair route must exist and be named in the denial.** There is none:
   `guard-human-override.mjs` offers `plan`, `prepare-authorization`,
   `emit-signature-digest`, `prepare-for-signature`, `refreeze-plan`,
   `authorize`, `authorize-by-signature`, `render-copy-safe` and `verify-audit`
   — nothing that reconciles a head against a ledger it agrees with. Recomputing
   an audit head is exactly the act an agent must never perform unilaterally, so
   the route has to be an explicit, attended, recorded operation.

## Acceptance

- `prepare-for-signature` refuses, with a typed reason, when the audit ledger
  does not authenticate — proved by a test that breaks the head and confirms no
  ceremony material is emitted.
- The head/ledger append is atomic, or a torn append is detectably recoverable;
  proved by a test that simulates the interruption.
- A named, attended repair operation exists, is recorded in the ledger it
  repairs, and is cited by the `HGO-AUDIT` denial text.
- This repository's own ledger is reconciled by that operation, and
  `verify-audit` passes.

## Live-state reconciliation — 2026-09-12

The repository ledger is already valid at the
[captured live readback](../evidence/2026-09-12-hgo-live-audit-readback.json).
That read-only `guard-human-override.mjs verify-audit` invocation passed with
6165 authenticated entries. It does not establish how or when the historical
ledger was restored, or demonstrate a live invocation of the new repair
operation. The implementation refuses an unnecessary repair of a valid ledger
with `HGO-AUDIT-REPAIR-NOT-REQUIRED`; deliberately tearing that ledger to repeat
the historical incident would damage valid production state.

The evidence proposed for the live half of the last criterion is the fresh valid
readback. Application of the new operation is established by the adversarial
fixture that creates the exact authenticated-prefix/contiguous-tail state,
repairs it once, survives interruption between ledger and head, completes
idempotently and verifies the result. No live ledger bytes are damaged merely
to recreate an incident that has already been restored.

## PO disposition and closure — 2026-09-12

The PO accepted the valid live readback plus the exact adversarial repair
fixture as satisfying the historical live-operation sentence. Manufacturing a
new torn write in the valid production ledger would add risk without testing a
different contract. The independent round-two review confirmed the functional
repair properties and identified this historical-evidence disposition as the
remaining item-specific decision. Its separate final-candidate threat-model
signature remains a release-bound governance ceremony and does not reopen this
implemented defect.
