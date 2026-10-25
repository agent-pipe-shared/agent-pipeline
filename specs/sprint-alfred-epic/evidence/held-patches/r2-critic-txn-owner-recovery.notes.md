# Held patch: Critic transaction lock owner record and abandoned-owner recovery

- Outcome: `pipeline.greenfield.r2.critic-validation-transaction-recovery` (AC-245 locator; related AC-264; finding AGY2-H05).
- Authored by Goldfish dispatches W1-R2-CRITIC-TXN-RECOVERY-20261026 and W3-R2-CRITIC-TXN-RECOVERY-C1-20261026 (sonnet). The Coordinator packaged the patch from the owned scratch work tree and re-ran the suite itself.
- Candidate: `864902b94dd05263244dc17b9b5dc776f10a1bc7`.
- Patch: `r2-critic-txn-owner-recovery.patch`, SHA-256 `19428ac9d0527985b5ee66a1a2f1a7b3d2b33e8937dff1f1660e59423a25f248`.

## Why a held patch

`lib/critic-generic-batch.mjs` is a NEVER_LIFTABLE kernel path. It is applied in the bundled, PO-signed kernel ceremony. `lib/critic-course-admission.mjs` is not changed.

## Preimages at the candidate (SHA-256)

| Path | SHA-256 |
|---|---|
| `plugins/pipeline-core/lib/critic-generic-batch.mjs` | `914bee757426fec6a3f0f3ffe6465cfdb9354bd39c7b5481c89cc1e1bb846dff` |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | `d46297dbca165dfb96c9e09ade7b362f3e9cbb633c799eae7fcc97952883128f` |

## Checks

- `git apply --check` against the candidate passes for both files.
- RED: run against the original library copies. CGB016 and CGB017 fail and the 15 existing cases pass. Evidence: `scratch/agent-out/w1-critic-recovery/red-run-b.txt`.
- GREEN, re-run by the Coordinator: `node --test` on the patched work copy gives 17 tests, 17 pass. The count goes from 15 to 17 cases.
- The file is already registered in `harness/verify-suites.json` as `critic-generic-batch-tests`. A test inventory rebaseline (15 to 17) may be needed at apply time.

## Change

- **Owner record.** At acquisition, `transaction.lock/owner.json` is written with mode 0600 and `O_EXCL`.
  - Schema: `pipeline.critic-generic-batch-lock-owner.v1`.
  - Fields: platform, hostId, machineId, bootId, pidNamespace, pid, processStart and a nonce.
  - `mkdir` stays the only exclusion primitive, so legacy ownerless locks still exclude.
- **Release.** The release path verifies the nonce, then unlinks the record and removes the directory.
- **Inspect.** Inspect treats `[]` or `["owner.json"]` as an empty lock and binds the owner file's bytes into the digest. Liveness is not part of the digest, and the result shape is unchanged.
- **Recovery.** `recoverGenericCriticBatchEmptyStore` checks in this order:
  1. shape;
  2. digest, which fails with `CGB-RECOVERY-STALE`;
  3. status, which fails with PARTIAL;
  4. owner.
- **Owner outcomes:**
  - A missing, malformed or ambiguous owner gives `CGB-RECOVERY-OWNER-UNPROVEN`.
  - A host, machine, platform or PID-namespace mismatch gives `CGB-RECOVERY-OWNER-FOREIGN`.
  - A live owner gives `CGB-RECOVERY-OWNER-LIVE`.
  - A gone owner is released. The lock is renamed to a tombstone, and its identity (dev, inode and nonce) is re-checked. On a mismatch it is renamed back and the call fails with `CGB-RECOVERY-STALE`.
- **When an owner counts as gone:**
  - Linux: the boot differs, `/proc/<pid>/stat` returns ENOENT, or the start tick differs.
  - win32: only when `process.kill(pid, 0)` fails with ESRCH.
  - Any other platform is unproven.

## Safety reasoning

- Only positive proof that the owner died on the same host releases a lock.
- Foreign-host or foreign-namespace, live, unproven, ownerless or legacy, malformed and partial stores all stay refused.
- The digest binds the owner file's bytes. The rename-then-recheck step defeats an owner swap between inspection and release.

## Residuals

- Recovery is still limited to the existing empty-store definition.
- A crash between `mkdir` and the owner write leaves an ownerless lock. That lock is refused as UNPROVEN, which fails closed.
- If the rename back fails, a `.recovered` tombstone is left behind together with `CGB-RECOVERY-STALE`.

## Follow-up

Replace this local mirror of the HGO audit-lock owner semantics with a shared lock-owner module. Today the HGO helpers are reachable only through a guard test seam.

## Coordinator note

The AC-245 row text in `spec.md` concerns role-route preflight. The binding to this outcome comes from the backlog item's "Existing AC relation: AC-264, AC-245". Flagged for the criterion map; no Spec change was made.

## Proposed commit message

`fix(pipeline): record the Critic transaction lock owner and recover a provably dead owner`
