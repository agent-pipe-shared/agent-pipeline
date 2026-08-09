---
schema: pipeline.backlog-item.v1
id: pipeline.guard-maintenance-window-rejects-a-fresh-setup1-authority-file
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Critic review (opus tier, functional-equivalent-read-only lane) of GF-069 (commit faf4c8dd), 2026-08-09. Finding F1: the backlog item's own mandated caller sweep ('grep for any other direct caller of verifyPoApprovalProof/verifyThreatModelApprovalRequest/verifyCriticalActionApprovalRequest with an external, PO-authored authority input') was not performed as specified before that item was implemented; performing it surfaces this third instance."
due: 2026-08-16
closed_at: 2026-08-09
closure_repository: self
closure_commit: 861a5b69535b689e501b4ca4562a5eba24bd35b4
closure_evidence: backlog/evidence/2026-08-09-guard-maintenance-window-humanname-fix-closure.md
---

# `guard-maintenance-window.mjs install --authority` rejects the exact authority file `setup --human-name` produces

## What happened

GF-067 (`pipeline-state.mjs`'s `verifyCriticalHumanProof`) and GF-069
(`po-approval-request.mjs verify`) each fixed one documented reader of the PO's
`trust-policy.json` that unconditionally rejected a fresh, correctly-generated
SETUP-1 (three-field: `keyReference`, `publicKeySha256`, `humanName`)
authority file. Both items asked whoever implemented them to grep for any
other direct caller of `verifyPoApprovalProof`/`verifyThreatModelApprovalRequest`/
`verifyCriticalActionApprovalRequest` receiving an external, PO-authored
authority input before considering the class closed. Neither actually ran
that sweep (GF-069's own evidence record documents a narrower test-file-import
grep instead, and states `guard-maintenance-window.mjs` is "confirmed
unaffected... uses its own 2-field trustAnchor fallback" — a claim the
GF-069 Critic review found does not survive inspection).

## Root cause (Critic-found, 2026-08-09, confirmed by direct code reading)

`plugins/pipeline-core/scripts/guard-maintenance-window.mjs`'s `install`
command takes an explicit `--authority <path>` option
(`scripts/guard-maintenance-window.mjs:13-16`, documented as an external file
that "must live OUTSIDE the repository, mirroring `po-approval-request.mjs`'s
external-transport discipline for human-produced material" — i.e. exactly the
same PO-authored trust-policy.json class the other two fixes address). When
given, that path is read and passed straight through, unnarrowed
(`scripts/guard-maintenance-window.mjs:119-120`):

```js
const trustPolicy = args.authority
  ? externalJson(rootDir, args.authority)
  : (() => { /* falls back to the 2-field policy.trustAnchor */ })();
```

This reaches `installGuardMaintenanceWindow` in
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:531`
(`verifyPoApprovalProof({ intent: rebuiltIntent, trustPolicy, proof })`), which
reaches the same `own(trustPolicy, ["keyReference", "publicKeySha256"])`
exact-key-set check in `po-approval-proof.mjs:8,34` the two prior fixes
already narrowed around. A three-field SETUP-1 authority file therefore fails
this call unconditionally with `GMW-PROOF-INVALID`/`PO-APPROVAL-PROOF-INVALID`,
regardless of otherwise-valid key material and signature.

**Confirmed unaffected (genuinely, this time):** the script's own **default**
branch — when `--authority` is omitted — falls back to the pre-existing
2-field `policy.trustAnchor`, which is a different code path from the one
above and does not exhibit this. GF-069's evidence record's error was
checking only that default branch and generalizing the conclusion to the
explicit `--authority` branch, which it does not cover.

## Why it matters

Same severity class and same narrow-but-real population as the two prior
fixes: anyone who has run `setup --human-name` and then supplies that
authority file to `guard-maintenance-window.mjs install --authority` hits
this, silently, with no path forward except discovering the field-count
mismatch by reading the source. This is the third documented reader of the
same file exhibiting the identical, already-twice-fixed defect — the
`own()` exact-match-vs-subset-match design question two prior items already
raised is now evidenced a third time.

## Direction

Apply the identical narrowing GF-067 and GF-069 already applied: project
`args.authority`'s parsed object down to `{keyReference, publicKeySha256}`
before it reaches `trustPolicy` in `guard-maintenance-window.mjs`'s explicit
`--authority` branch (`scripts/guard-maintenance-window.mjs:119-120`), leaving
the full object available wherever attribution might separately be recorded.
Do not touch the default (`policy.trustAnchor`) branch — it is already
correctly 2-field. **Before considering this item closed, actually run** (not
merely restate as already-done) the exhaustive grep for every direct caller
of `verifyPoApprovalProof`/`verifyThreatModelApprovalRequest`/
`verifyCriticalActionApprovalRequest` that can receive an external,
PO-authored authority object, and record the exact command and its full
output as durable evidence — the omission of this exact step is what let this
instance and the process gap around it both go unnoticed twice in a row.

## Separate, standing design question (not this item's to resolve)

Whether `po-approval-proof.mjs`'s `own()` should remain an exact key-set/count
match at all, versus a subset check ("at least these two fields present,
extras ignored") that would make this entire class of writer/reader drift
structurally impossible on the reader side. This is now the THIRD independent
call site needing the identical narrowing workaround since SETUP-1 added
`humanName` — see the same question already raised in
`2026-08-09-po-approval-request-verify-still-rejects-a-fresh-setup1-authority.md`.
Still a deliberate Elephant/PO tradeoff, not an implementor's to decide
unilaterally.

## Related

- `2026-08-09-approve-push-rejects-any-fresh-post-setup1-authority-file.md` (closed, GF-067) — first instance.
- `2026-08-09-po-approval-request-verify-still-rejects-a-fresh-setup1-authority.md` (GF-069) — second instance, and the item whose own mandated sweep should have caught this third one before it shipped.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, fixed, closed.
- **Rationale:** Same defect class as GF-067/GF-069, fully specified fix; the mandated caller sweep was actually run this time (see closure evidence) and confirms no fourth sibling remains in the current codebase.
- **Assignment:** GF-072 (goldfish-implementor), self-verified by the Elephant (diff read, suite re-run, Full Verify evidence checked) — no third Critic dispatch, per the standing two-round cap and this exact pattern already having cleared Critic review twice.
- **Date:** 2026-08-09
