---
schema: pipeline.backlog-item.v1
id: pipeline.po-approval-request-verify-still-rejects-a-fresh-setup1-authority
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Critic review (claude-opus-5, max, functional-equivalent-read-only lane) of GF-067 (commit ad81a9b9), 2026-08-09. Finding F1, verdict FAIL solely on this residual + the missing durable record of it -- GF-067's own commit was cleared as correct, minimal and genuinely tested; do not alter ad81a9b9."
due: 2026-08-16
---

# A second, documented reader of `trust-policy.json` still rejects the exact authority file `setup --human-name` produces

## What happened

GF-067 (commit `ad81a9b9`) fixed `pipeline-state.mjs`'s `verifyCriticalHumanProof`
(the function `approve-push` calls) so it accepts a fresh, three-field
(`keyReference`, `publicKeySha256`, `humanName`) SETUP-1 authority file
instead of unconditionally rejecting it. That fix is correct, minimal, and
verified — this item does not touch it.

`po-approval-request.mjs verify` reads the identical `trust-policy.json` file
through the identical shared verification contract, and was not part of
GF-067's scope (correctly — QG-07 forbids drive-by scope in a bugfix). It
still forwards the raw, unnarrowed authority object:

- `plugins/pipeline-core/scripts/po-approval-request.mjs:81` —
  `trustPolicy: externalJson(args.repoRoot, args.authority)` (unnarrowed)
- `plugins/pipeline-core/lib/threat-model-approval-request.mjs:90` — forwards
  it unchanged into `verifyPoApprovalProof`
- `plugins/pipeline-core/lib/po-approval-proof.mjs:34` → `:8` — the same
  `own()` exact-key-set check GF-067's backlog item traced: a 3-field object
  fails unconditionally, surfacing as
  `THREAT-APPROVAL-EXTERNAL-AUTHORITY-REQUIRED` (cause `PO-APPROVAL-PROOF-INVALID`)

This is a **documented, human-facing command**:
`docs/po-approval-proof-contract.md:64-68` shows the exact invocation with
`--authority "$PO_DIR/trust-policy.json"` — the same file
`po-human-approval.mjs setup --human-name` writes with three fields
(`po-human-approval.mjs:72-73`, `:337`, `:361`). Anyone who runs `setup
--human-name` and then follows that documented `verify` command hits the
identical failure GF-067 fixed for `approve-push`, unchanged.

`po-human-approval.mjs`'s own `verify` subcommand (lines 452-453) already
narrows before calling the same shared verifier — so the asymmetry is
specifically between that command and `po-approval-request.mjs`'s `verify`,
not a universal gap.

**Confirmed unaffected:** `guard-maintenance-window.mjs`'s `--authority`
default branch falls back to the 2-field `policy.trustAnchor` and does not
exhibit this.

## Why it matters

Same severity class as the original: a documented command fails for exactly
the file the documented setup path produces. Low blast radius (the same
narrow population GF-067's item already described — anyone who has run
`setup --human-name`), but the failure is silent-until-hit and the fix
pattern is already proven correct in two other call sites
(`po-human-approval.mjs:452-453`, and now `pipeline-state.mjs`).

## Direction

Apply the identical narrowing GF-067 already applied and
`po-human-approval.mjs`'s own `verify` already uses: project the external
authority object down to `{keyReference, publicKeySha256}` before it reaches
`trustPolicy` in `po-approval-request.mjs` (~line 81), leaving the full
object available wherever attribution is separately recorded. Grep for any
other direct caller of `verifyPoApprovalProof`/`verifyThreatModelApprovalRequest`/
`verifyCriticalActionApprovalRequest` with an external, PO-authored authority
input before considering this closed — GF-067's Critic review found this one
by direct code reading, not by an exhaustive call-site sweep.

## Separate, standing design question (not this item's to resolve)

Whether `po-approval-proof.mjs`'s `own()` should remain an exact key-set/count
match at all, versus a subset check ("at least these two fields present,
extras ignored") that would make this entire class of writer/reader drift
structurally impossible on the reader side. Three independent call sites have
now needed the identical narrowing workaround since SETUP-1 added
`humanName`; a subset-match contract would need it applied nowhere. This is a
deliberate Elephant/PO tradeoff (a subset check is more permissive about
unexpected fields reaching a security-verification contract), not a
default an implementor should choose unilaterally.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
