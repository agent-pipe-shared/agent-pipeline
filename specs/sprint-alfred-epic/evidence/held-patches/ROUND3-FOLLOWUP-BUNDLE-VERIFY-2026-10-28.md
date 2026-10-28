# Round-3 follow-up held-patch bundle v1, verification and PO apply blocks (2026-10-28)

Bundle: `w7-round3-followup-bundle-v1-2026-10-28.patch` (8 files, +703/-20, 2 patches). It stacks on the tree that contains the
round-3 bundle v1 (applied at 692301fd9, stamped at 59b3a7b65, installed as `0.7.0+claude.20261028091024.692301f`). It applies cleanly
with `git apply` on a fresh clone of the repository HEAD 749f00382 (both patches applied and committed one by one, 2 of 2 OK).
It is a HELD PATCH: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so. No changed file is a
protected path of the guard union as classified by the Goldfish slices (no `lib/guard/*`, no `scripts/pipeline-state.mjs`).

## Why this bundle

The first tests of the installed round-3 build (Glossover, Toolbox) found that PF-93 and D52 clause work stopped one step short:

- **PF-93 (Glossover):** the consumed legacy packet could not be exported or read back (`SCF-EXPORT-UNCONSUMED`). Cause: the finalizer bound
  `receipt.packetDigest` to the normalized view of the claimed admission, while every consumed-packet reader recomputes the raw on-disk
  digest. Plus five strict readers now take the explicit legacy read.
- **D60 (Toolbox):** a failed first `admit` left a claimed packet; the next `admit` ran the preflight first and ended in `SCF-PREFLIGHT`
  behind `CGB-HELD`. There was no sanctioned way to discard the packet.
- **D31 (PO design):** a Goldfish that returns `outcome: checkpoint` must keep working while a budget grant remains; the slice stays started and
  the Elephant's only option is the sanctioned cancel.

The D60 chain was walked end to end on purpose (PO request): the c2 resume alone did not cover a held packet whose batch index is gone
(`CGB-MEMBER`), which the c3 slice found and fixed; c4 added the refusal cases and one full path test.

## Contents, in apply order

1. `w7-d60-toolbox-path-verification-c4` — one cumulative patch (apply it INSTEAD of the PF-93 readers c2, D60 c2 and D60 c3 patches, which it contains):
   - `critic-packet-preflight.mjs`: the five readers of a consumed or claimed legacy packet (export write and read, consumed snapshot, block,
     consumed session admission) take the explicit `allowLegacyPreAssurance` read; default stays strict, CPP09 and CPP15 unchanged.
   - `session-critic-finalizer.mjs`: receipt and result bind the raw packet digest; `resumeHeldGenericPacket` runs before the preflight and resumes
     a same-task, same-candidate packet (also when the batch index is lost, via the new `republishGenericCriticBatchIndex`; a foreign index entry
     fails closed with `CGB-CONFLICT`); new verb `release`.
   - `critic-generic-batch.mjs`: `republishGenericCriticBatchIndex`; the `CGB-HELD` refusal names the held packet and the release verb.
   - `critic-packet-release.mjs` (new, with test): a prepared or claimed packet is released with an append-only audit record written first, the
     packet is moved into `released/` (nothing is deleted), idempotent, a consumed packet is refused, the reason is bounded and carries no paths.
2. `w7-d31-checkpoint-continues-the-goldfish` — `hooks/native-goldfish-host.mjs`: `nativeGoldfishCheckpointBlock`. On a Claude `SubagentStop` with a
   recorded checkpoint and an unspent verified grant the hook emits the block decision (never when `stop_hook_active`, one block per recorded grant,
   every fault means no block); the Codex path and the finalizer are unchanged.

## Test evidence

Composed clone (`node --test <file>`), plus the Goldfish clone logs for the suites the bundle does not touch:

| File | tests | pass | fail |
|---|---|---|---|
| `lib/critic-packet-release.test.mjs` (new) | 5 | 5 | 0 |
| `lib/native-goldfish-host-finalizer.test.mjs` | 27 | 27 | 0 |
| `scripts/session-critic-finalizer.test.mjs` | 61 | 60 | 1 |
| `lib/critic-generic-batch.test.mjs` (Goldfish clone, same production files) | 33 | 33 | 0 |
| `scripts/critic-packet-preflight.test.mjs` (Goldfish clone) | 17 | 17 | 0 |
| `scripts/check-critic-skip-coverage.test.mjs` (Goldfish clone) | 48 | 48 | 0 |
| `lib/critic-review-lineage.test.mjs` (Goldfish clone) | 14 checks | 14 | 0 |
| `lib/native-goldfish-host-state.test.mjs` (Goldfish clone) | 58 | 58 | 0 |

The one finalizer failure is the pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it
fails identically on the unchanged baseline (47 tests, 46 pass, 1 fail). Full Verify is not run for this bundle.

## For the batch Critic

- Kernel path: `session-critic-finalizer.mjs` (`resumeHeldGenericPacket`, the raw-digest binding in the prepared view and `validateResult`),
  `critic-generic-batch.mjs` (`republishGenericCriticBatchIndex`), `critic-packet-release.mjs`. Check that a republished index cannot make a
  later reader accept a registration of another declared scope, and that the resume never matches a packet of another task or candidate.
- Gaps named by the Goldfish slices: no case for "different task, same target" (needs a signed-quality-import fixture; authored-delivery
  targets embed the task id); `critic-verify-lifecycle.mjs` and `critic-review-lineage.mjs` read consumed packets only through the
  preflight readers; the feature-request admit path (no generic batch) is not resumed before the preflight.
- D31: `NGHF21` to `NGHF24` assert "no output" and would also pass if the hook exited early; `NGHF20` and `NGHF22` prove the hook runs.

## Not covered, named gates

- **D31 native qualification:** whether Claude Code honours the block decision for a background Goldfish is only provable in a real native run
  after install. The grant headroom figure (30 for a 40-call agent) stays the PO's decision.
- **Verify-suite registration** of `critic-packet-release.test.mjs` (`harness/verify-suites.json` and the case-completion configs) is a protected
  path and still to do; until then Verify does not run that file.
- Critic, Full Verify, native Windows run (D58/D59/D60) and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-round3-followup-bundle-v1-2026-10-28.patch`
then `git status --short`.

Block 2, stage with a path limit and commit with your own ceremony: `git add -A -- plugins/pipeline-core`.

Block 3, synchronize the installed plugin copy and install per `docs/push-release-flow.md`. The bundle changes a hook
(`hooks/native-goldfish-host.mjs`), so run the hook refresh once after the install. The stamp is done by the Elephant
(`scripts/stamp-candidate.mjs`) after you tell it the install is done.
