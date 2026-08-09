---
schema: pipeline.backlog-item.v1
id: pipeline.approve-push-rejects-any-fresh-post-setup1-authority-file
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Live observation: the PO's private Claude+Pipeline 0.5.4 happy-path re-test (fifth local candidate) failed approve-push and needed a manual terminal fix outside the session; Codex's equivalent run got a signed push through. Confirmed at the code level by reading pipeline-state.mjs, po-approval-proof.mjs and po-human-approval.mjs, 2026-08-09."
due: 2026-08-16
closed_at: 2026-08-09
closure_repository: self
closure_commit: ad81a9b9ab89aab52fb4099971c3c3a0fcd6f852
closure_evidence: backlog/evidence/2026-08-09-approve-push-humanname-fix-closure.md
---

# `approve-push` rejects every authority file `setup --human-name` correctly produces

## What happened

In the observed happy-path re-test, Codex's run eventually got a signed push
through; Claude's did not, and needed a manual fix outside the session. Both
used a freshly generated (post-SETUP-1) PO key/authority.

## Root cause (found by code reading, 2026-08-09)

`po-human-approval.mjs setup` (SETUP-1) now writes the local authority record
with three fields — `{keyReference, publicKeySha256, humanName}`
(`localAuthority()`, ~line 72-73). This is also the shape that ends up in the
external, cross-repo authority file `approve-push --proof-authority` reads.

`po-human-approval.mjs`'s OWN `verify` subcommand already knows the two
schemas diverge and narrows the record before calling shared verification
(lines 447-453), with a comment explaining exactly why:

> The shared trustPolicy contract (verifyPoApprovalProof et al.) checks an
> EXACT {keyReference, publicKeySha256} shape; the LOCAL authority record
> additionally carries `humanName` (SETUP-1). Only the two key-identity
> fields travel into verification...

`pipeline-state.mjs`'s `verifyCriticalHumanProof` — the function `approve-push`
actually calls — never got the same treatment. At line 2750 it passes the
external authority file straight through, unnarrowed:

```js
trustPolicy: authority.value,
```

This reaches `verifyCriticalActionApprovalRequest`, which reaches the shared
`own(trustPolicy, ["keyReference", "publicKeySha256"])` exact-key-set check
in `po-approval-proof.mjs:34` (`own()` requires the object's key COUNT and
SET to match exactly, `po-approval-proof.mjs:8`). A 3-field authority object
fails this unconditionally, regardless of whether the key material and
signature are otherwise perfectly valid, and `approve-push` refuses with a
`CRITICAL-PROOF-*` code.

## Why it matters

This is the mirror image of the already-filed
`2026-08-09-setup-promises-a-human-name-repair-it-cannot-perform.md`: that
item is a *pre*-SETUP-1 (2-field) authority record failing `sign-intent`/
`approve`/`approve-critical`, which now want 3 fields. This item is the
opposite direction — a *correctly generated*, *post*-SETUP-1 (3-field)
authority record failing `approve-push`, which still wants exactly 2. Read
together, there is currently **no authority-file shape that satisfies both
sides of the same signing ceremony at once**: 2 fields passes `approve-push`
but fails `po-human-approval.mjs`'s own sign/verify path; 3 fields passes
`po-human-approval.mjs` but fails `approve-push`. SETUP-1 updated the writer
and one reader, and missed the other.

Given `gates.push_approval: signature` is this repo's own configured default
(CLAUDE.md, ADR-0056) and the mode every fresh consumer project inherits,
this blocks the default, documented push-approval path for anyone who has
run `setup --human-name` — not an edge case.

## Direction

Give `verifyCriticalHumanProof` (`pipeline-state.mjs`, ~line 2750) the same
narrowing `po-human-approval.mjs`'s own `verify` subcommand already does —
project `authority.value` down to `{keyReference, publicKeySha256}` before it
reaches `trustPolicy`, the same split `signIntentIntoProof` already keeps.
`humanName` should still travel into the recorded approval for attribution
(e.g. the signer identity recorded against the push) — it just should not
reach the exact-shape verification contract, exactly as the existing comment
at `po-human-approval.mjs:447-453` already describes for its own call site.

Whoever implements this should also flag, but not necessarily resolve here,
whether `own()`'s exact-match check in `po-approval-proof.mjs` is the right
long-term contract at all, versus a subset check ("at least these two
fields, ignore extras") that would make this class of writer/reader drift
structurally impossible on the reader side. That is a design tradeoff for
the Elephant/PO, not the implementor's to decide unilaterally.

## Related

- `2026-08-09-setup-promises-a-human-name-repair-it-cannot-perform.md` — the
  pre-SETUP-1 (2-field) direction of the same underlying incomplete
  migration.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
