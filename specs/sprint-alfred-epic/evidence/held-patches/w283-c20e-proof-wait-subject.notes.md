# w283: the signature wait counts a proof as present only for the expected subject (candidate 20e, G20-76, AC-108)

Base: `c17db9404` (the applied and stamped candidate 20d with the 20e part 1 chain). Built in the slice clone `scratch/agent-out/c20e-pw`. One held patch; it applies to the real repository on that base.
Closest criterion: AC-108 (PRD and Spec unchanged).

STATUS: implementation complete in the clone and saved as the held patch; targeted delivery see "Evidence" below. No full Verify, no Critic review, no PO acceptance (Coordinator owns those).

## What was measured

Observed live 2026-11-08 at the push of candidate 20d. `po-human-approval.mjs authorize-critical` mirrors request, proof, authority and signer into `scratch/critical-<kind>-{request,proof,authority,signer}-<repository fingerprint>.json`. The name is ONE fixed fingerprint per repository and kind, so every signature of the same kind overwrites the same names. While an older mirror sat in `scratch/`, `proof-wait.mjs` returned `proof-present` at once (it only checked that a regular file with schema `pipeline.po-approval-proof.v1` exists); `pipeline-state.mjs approve-push` then refused with `CRITICAL-PROOF-SUBJECT`. Nothing was consumed, but the PO's signing round was wasted.

## What the patch changes

1. `lib/signed-proof-wait.mjs`: `observeProofFile(root, reference, subjectSha256 = null)`. Without a subject it is byte-identical to before. With a subject and a SCRATCH proof, a well-formed proof is `present` only when BOTH hold, otherwise the new state `stale`:
   - the sibling request (the existing `proof-` -> `request-` name mapping, same `scratch/` directory, lstat-regular, not a symlink, at most 1 MiB) parses, has schema `pipeline.critical-action-approval-request.v1` (the constant is imported from its owner, `critical-action-approval-request.mjs`) and `action.subjectSha256` equals the expected subject exactly;
   - the proof signs that request: `proof.intentSha256 === request.approvalIntent.sha256`.
   A sibling request that is missing, unreadable, not JSON, of another schema or without a subject is `stale` (not signed yet): the wait keeps polling.
2. The proof file itself does NOT carry the subject (`verifyPoApprovalProof` pins its keys to `schema, intentSha256, keyReference, publicKey, signatureBase64`). What it does carry is `intentSha256`, and the request's intent digest embeds the action (subject and `expiresAt`), so a re-signed request always has a new intent. The request is mirrored before the proof, so a NEW request together with the OLD proof can exist for a moment; the `intentSha256` equality closes exactly that window.
3. The subject is never re-derived by the wait. The caller holds the value (push-prepare gets it from `prepare-push-subject`, which uses `criticalActionSubjectSha256`, the function approve-push compares against: `action.subjectSha256 !== expectedSubject`); the wait does the same string equality. No new first-party import beyond `critical-action-approval-request.mjs`, which is already in the kernel closure list (GMWKC01 stays green, no threat-model entry needed). No signature is verified and no key is read.
4. `proofWaitCommand` / `awaitSignatureFields` take an optional `subjectSha256` (64 lowercase hex, otherwise a `TypeError`). The argv gets `--subject <sha>` AFTER `--timeout`, so every existing `argv.slice(1, 5)` pin still holds; without a subject the argv is unchanged. `afterSigning` then names that the wait ends only for the expected subject.
5. `scripts/proof-wait.mjs`: `--subject` joins the closed flag set of `parse()`; a malformed value (not 64 lowercase hex) or a repeat is `PROOF-WAIT-ARGS`.
6. New typed refusal `PROOF-WAIT-STALE` at a timeout where the last observation was `stale` (a file existed but never matched). Its single `repair`: rename (do not remove) the older mirror files (the four `scratch/critical-<kind>-{request,proof,authority,signer}-<fp>.json` names, derived from the proof path), have the PO run the one signing command again, then run the same wait (with the same `--subject`). `PROOF-WAIT-TIMEOUT` (nothing at the path) and `PROOF-WAIT-INVALID` (not a proof) keep their texts.
7. `lib/guard/command-catalogue.mjs` (`sanctionedProofWaitArgs`): the shell grammar admits exact argv only; without this change the new waitAction would be refused by the guard union at the agent's first run. It now admits `[--timeout <1-600>] [--subject <64 lowercase hex>]` in that order, each at most once; every other shape stays refused (the pre-existing "extra flag", "timeout over bound" cases are untouched). This was not in the briefing's list; it is the one file beyond it that the feature cannot work without.
8. `scripts/push-prepare.mjs`: passes the already computed `subjectSha256` to `awaitSignatureFields` (only when it is 64 hex; anything else keeps the old no-subject wait instead of crashing the report).

## Call-site audit (all four callers of `awaitSignatureFields`)

- `scripts/push-prepare.mjs`: subject available (`subject.value.subjectSha256`, computed just above) and the proof is the fixed-name scratch mirror: PASSED.
- `scripts/pipeline-state.mjs` (design approval, `inspect` nextAction; plus the `present-plan` printout through `proofWaitCommand`): no change. The proof path is `scratch/design-approval-proof-<digest of the design binding>.json`, i.e. content-addressed, so an older signature cannot sit at that name; the request there is a design-approval request, not a critical-action request.
- `lib/project-onboarding-v3.mjs` (bootstrap plan acknowledgement): no change. The proof path is `scratch/bootstrap-plan-acknowledgement-proof-<intentSha256>.json`, content-addressed by the intent.
- `lib/human-guard-override.mjs` (key-directory form): no change. The reference is `<key directory>/proof-<intent sha256>.json`; the intent hash is part of the file name. The wait ignores a subject for a key-directory reference anyway.

## Evidence (clone, one suite at a time; `node scratch/agent-out/test-in.mjs <clone> <suite> --private-tmp`)

RED before the first production edit: push-prepare 94 pass / 1 fail (the new case); pin three-runner-happy-path-with-two-po-approvals 28 pass / 4 fail / 1 skip (the four new cases; the fifth new case, the malformed-subject refusal, already passed because the flag was unknown, which is also a refusal).
GREEN on the final clone commit (`d1bc610ad`, exit 0 each): push-prepare 95/95; pin three-runner-happy-path-with-two-po-approvals 32 pass + 1 pre-existing skip (33 tests); guard-maintenance-window-kernel-closure 1/1 (GMWKC01); harness check-auth-gate-inventory-drift 35/35; human-guard-override 185 pass + 1 pre-existing skip (186 tests, it consumes `awaitSignatureFields`); and the held-patch check `w283-c20e-proof-wait-subject.check.test.mjs` 4/4.
`project-onboarding-v3.test.mjs` (the onboarding caller, untouched) was started as extra caution and had not finished when the tool budget ended: not verified, not required by the package.
Inventory: +1 case in `scripts/push-prepare.test.mjs`, +5 cases in the registered pin `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` (no new test file); the Coordinator's rebaseline is needed.

## Interim hint (until this patch is installed)

Before any `push-prepare`, set the old `scratch/critical-*` files aside (rename, never delete): `scratch/critical-push-request-<fp>.json`, `-proof-`, `-authority-`, `-signer-`. With nothing at those names, the old wait waits for the new signature as intended.

## Not changed

- A same-subject older signature (same destination and commit, signed earlier) still pairs with its own request and counts as present; its `expiresAt` is what approve-push then judges (`CRITICAL-ACTION-PROOF-EXPIRED`). The wait compares subject and intent, not time.
- `signCommandForProof` keeps its own `proof-` -> `request-` mapping line; it was not rewritten onto the new helper (smallest change).
- `docs/push-release-flow.md` does not describe the wait or waitAction; no docs change.
- `po-human-approval.mjs authorize-critical` and its mirror order are untouched (the fixed naming is the cause, and the wait is the place that must not trust it).
- The key-directory form is unchanged.
- The `present-plan` printout in `pipeline-state.mjs` (design approval) keeps its subject-less wait for the reason in the audit.

## Not proven

No live push-prepare / authorize-critical / approve-push round with a real signature and a real stale mirror (the mirror files are built by the tests in their own temporary project with the real names and the real request builder). No Windows-native run of the guard grammar admission (the added cases run through `isSanctionedLifecycleCommand` on this platform).
