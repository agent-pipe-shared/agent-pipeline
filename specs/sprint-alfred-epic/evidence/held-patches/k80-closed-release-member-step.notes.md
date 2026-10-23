# K80-K1D-CLOSED-RELEASE-MEMBER-STEP notes

Status: implementation complete in clone `k80`; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## What changed (clone `k80`, no commit; diffs exported)
Protected (`k80-protected.diff`):
- `plugins/pipeline-core/lib/onboarding-continuity.mjs`
  - `recordClosedOnboardingSessionCleanupRelease`, `releaseProof === null` branch: under the State lock it now only writes the receipt (idempotent, `afterReceiptWrite` hook unchanged); it no longer deletes the binding. After the lock is released the new `finishPrivateClosedCleanupRelease` runs the EXISTING orphan member step (`runOrphanSessionAuthorityMemberStep`, no second step invented): in one registry boundary it rechecks receipt + binding bytes, releases the registry member of the binding's session tuple FIRST (`releaseLostSessionAuthorityMember`, which itself refuses a live descriptor), deletes the binding under the State lock taken inside the boundary (`afterBindingUnlink` hook unchanged), then heals with strict read-back, then the existing replay read-back.
  - Snapshot admission (`continuityAuthoritySnapshot`): rotated receipt archives are now named by (a) the byte digest (orphan, unchanged), (b) the receipt's own `recoveryPlanSha256` when it is a private-closed receipt (K72 option 1 ii), or (c) `canonicalSha256({kind, recoveryPlanSha256, receiptSha256: bytesDigest})` with kind in {quarantined-private-release-receipt, conflicting-private-release-receipt} and the plan hash attested by the current receipt/marker or another archive of the namespace. (c) was NOT in K72: the case's later quarantine and conflict-rotation steps (`quarantineClosedPrivateCleanupReleaseReceipt`, `privateReceiptRecoverySha256` rotation) write exactly those archive names and the snapshot refused them as soon as the member step made the snapshot reachable. Design note for the Critic: (c) is a bytes-bound admission, but a planted file can attest a plan hash for another planted file; same strength as the pre-existing digest-named rule (private 0600 directory, owner-checked by `assertPrivateCleanupFile`).
  - Helpers `continuityAuthorityAttestedPlans`, `continuityAuthorityArchiveNamed`.
- `plugins/pipeline-core/lib/session-authority-orphan-member-step.mjs`: new optional parameter `rerun` (text of the repair hint, default unchanged) so the repair says "rerun apply-recovery" for the closed route.
Unprotected (`k80-unprotected.diff`): `plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`: one NEW case (crash after member release and binding unlink, replay, bound start, registry readable) + two imports. No existing case or assertion touched.

Interaction with C20 (`k67-discard-feature-finish-orphan-release.patch`, `pipeline-state.mjs`): none. C20 calls `finishOrphanSessionCleanupBindingRelease` (orphan route, unchanged); this change touches only the `releaseProof === null` private closed route and the snapshot admission, and reuses the member-step module only through its public parameters (default behaviour unchanged).

## Security read (D65)
- Can release: one registry member of producer `onboarding-continuity` whose association target equals the session tuple (sessionId + descriptorSha256) of the private binding that the MAC-authenticated receipt proves (receipt `bindingSha256` == digest of the binding read in the boundary), in an in-flight phase, and only when the session descriptor file is gone (`releaseLostSessionAuthorityMember` refuses `SDC-DESCRIPTOR-CAS lost-member-descriptor-live`). Before that, `privateClosedReleaseContext` (unchanged, under the State lock) already required: neutral project, closed mode, binding.featureId == last closed feature, coordinator close digest + revision 2 + phase `feature-close-prepared`, zero active descriptors, closure proof `closed` with the exact receipt digest.
- Must refuse (all typed, `committed: true`, repair text names `session-authority-repair.mjs inspect` and `rerun apply-recovery`): receipt missing/invalid/MAC-failed or with a different state, closure, plan or coordinator digest; binding changed from what the receipt names; State changed; more than one in-flight member naming the session (`lost-binding-members-ambiguous`); a live registry lock or State lock (no waiting); registry that does not read back strictly after the heal. A registry that never existed (D44) skips the member release and accepts `absent`.
- Malicious/stale receipt: a receipt cannot name a target, it carries only `bindingSha256`; the target is taken from the binding file, which must hash to that value and is deleted only if equal to what the State-locked recheck sees. A stale receipt (older plan) fails the plan/state/closure equality; a forged one fails the MAC (private key). A copy of an old valid receipt plus a restored old binding is the existing restore-binding scenario of the case: the member step then finds `none` (already released) and the delete completes - it cannot release a member of a different session.
- Widening: none. No new capability, no new module (no kernel-list or threat-model entry), no new lock; the member-release primitive and its descriptor-live refusal are the existing ones. The new archive-name admission only ADMITS more rotated archive names in the snapshot read; it grants no write and releases nothing.

## Measured (exact commands, private TMPDIR under the home directory, one run at a time)
Runner: `node scratch/k80-run.mjs <label> <file> [name-pattern]` (clone cwd, TMPDIR under the home directory outside every repository). Logs: `scratch/agent-out/k80-<label>.log`. Baseline = K72 notes (binding 66/67 with the one red).
- Target case alone (pattern "neutral coordinator-close release is private"), first attempt with only member step + closed-schema name rule: exit 1; it passed the bound start and the first apply, then failed at the quarantine/conflict-rotation apply (archive names of quarantined/conflicting receipts) with `SESSION-CLEANUP-PRIVATE-RELEASE-REGISTRY-READBACK`/`unknown continuity private namespace entry`; after adding rule (c): exit 0, 1/1.
- New case alone: first run exit 1 because my own assertion read the registry right after the replay (drift is only healed by the next reconcile when no member is in flight; the replay needs no heal step: moved the assertion after the bound start), second run exit 0, 1/1.
- `plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs` whole file, alone: exit 0, 68/68 (67 + the new case), 698 s. Baseline 66/67.
- `plugins/pipeline-core/lib/session-cleanup-recovery.test.mjs`: exit 0, 39/39 (93 s).
- `plugins/pipeline-core/lib/session-cleanup-lost-binding.test.mjs`: exit 0, 8/8 (149 s).
- `plugins/pipeline-core/scripts/pipeline-state-discard-feature.test.mjs`: exit 0, 11/11 (2 s).
- `plugins/pipeline-core/lib/onboarding-continuity.test.mjs`: exit 0, 306/306 (631 s), run once, alone, after the change.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: exit 0, 9/9.
- Not measured: RED of the NEW case against unchanged code (no separate run; the unchanged code fails the same bound start with `namespace-drift`, as the baseline red of the target case shows). The architecture-boundary check was not run.
- Once, a second heavy suite (recovery) was started while the binding suite ran and stopped again within seconds (pgrep afterwards: gone); the binding suite result was 68/68 regardless.

## Diffs
- `scratch/agent-out/k80-protected.diff` (onboarding-continuity.mjs, session-authority-orphan-member-step.mjs) and `scratch/agent-out/k80-unprotected.diff` (session-cleanup-binding.test.mjs); `git apply --check` from the main checkout: clean for both. Clone edits reverted with the Edit tool; `git -C scratch/clones/k80 status --short` is empty. The new test case is green only with the protected diff applied (it documents the contract); apply protected first.

## Ratchet effect (`architecture/boundary-policy.json`, over-line-bound entries; policy not edited)
- `onboarding-continuity.mjs`: accepted 12295, main HEAD 12293, with the change 12364 (+71): 69 lines OVER the accepted bound. Remedy options for the operator: raise the accepted line to 12364 in the same protected commit, or move the pure archive-name helpers and the finish function into a kernel module (needs injecting the private-state primitives; not done, larger change).
- `session-authority-orphan-member-step.mjs`: +2 net (`rerun` parameter); no over-line-bound entry for it.
- `session-cleanup-binding.test.mjs`: +91 lines (no entry found in the policy for it by `rg`).

## Proposed commit messages (trailers exactly)
Protected commit (operator):
```
fix(continuity): run the registry member step for the private closed cleanup release

The private closed release (recordClosedOnboardingSessionCleanupRelease, releaseProof null)
wrote its receipt and deleted the binding with no registry step, so the producer namespace
drift of an in-flight member was never healed and the next bound start refused. Reuse the
D73 E orphan member step: the receipt is written under the State lock; after the lock one
registry boundary rechecks receipt and binding, releases the lost member first, deletes the
binding, heals and reads back strictly. Admit rotated private-closed receipt archives named by
their recoveryPlanSha256 (and quarantined/conflicting archives named by a hash over an
attested plan hash and their byte digest) in the continuity snapshot.

AI-Assisted: true
Dispatch: K80-K1D-CLOSED-RELEASE-MEMBER-STEP (goldfish)
```
Unprotected commit (after the protected one):
```
test(session-cleanup): pin crash recovery of the private closed release with an armed member

AI-Assisted: true
Dispatch: K80-K1D-CLOSED-RELEASE-MEMBER-STEP (goldfish)
```
Note: `evidence/dispatch-record-K80-K1D-CLOSED-RELEASE-MEMBER-STEP.json` must exist (terminal outcome, changedFiles covering these paths) before a commit carrying that Dispatch trailer verifies.

## Open items
- Rule (c) of the snapshot admission goes beyond K72 option 1; Critic/PO to confirm (D65).
- The in-lock replay branch (second `privateClosedReleaseReplay` under the State lock) still returns without a registry step; harmless, the member is already released whenever the binding is gone.
