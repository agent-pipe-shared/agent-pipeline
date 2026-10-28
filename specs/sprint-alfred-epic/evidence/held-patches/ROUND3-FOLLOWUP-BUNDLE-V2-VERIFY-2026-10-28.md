# Round-3 follow-up held-patch bundle v2, verification and PO apply blocks (2026-10-28)

Two patches, to be applied and committed TOGETHER as one commit:

1. `w7-round3-followup-bundle-v2-2026-10-28.patch` (12 files, +620/-166, mostly the regenerated `architecture/map/overview.html`).
2. `w7-inventory-pci16-pci24-baseline-reds-c14.patch` (2 files, +9/-1), the increment that makes the inventory suite green.

Base: the tree that contains the installed build `0.7.0+claude.20261028105149.e883458` (the round-3 follow-up bundle v1 is already in it;
v2 stacks on it and replaces nothing). Both patches apply with `git apply` on a fresh clone of the repository HEAD 6c41c8e41 (the doc and evidence commits after it change no file the patches touch), one after the other.
This is a HELD PATCH: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so.

## Why this bundle

The installed build 20261028105149 was tested by Glossover and Toolbox; both found a fault one step short of what the last round fixed, and the PO
asked to walk the whole downstream path and test the real and upgrade states, not states built by new code.

- **PF-93 (Glossover), export still `SCF-EXPORT-UNCONSUMED`:** the receipt of a legacy packet finalized by the previous build binds the digest of the
  NORMALIZED view of the packet; the current readers compared the RAW digest only. Fix: one shared `packetDigestMatches(packet, digest)` in
  `critic-packet-preflight.mjs` accepts the raw digest or the normalized-view digest of the SAME packet; a foreign digest or a changed packet is still
  refused. Used by export, result validation and the Verify lifecycle reader. Proved with the real previous build (commit 692301fd9) and a genuine
  legacy chain, not with hand-written digests (c8, c11, c12, c13).
- **D61 (Toolbox), `CGB-HELD` from a leftover `transaction.lock` of a dead owner over an empty store, no sanctioned command:** the finalizer gets two
  verbs, `inspect-batch-recovery` (read-only, prints status and digest) and `recover-batch` (digest-bound release of an empty store); the `CGB-HELD`
  refusal names both with their usage. A live owner, a stale digest and a non-empty store stay refused. Proved with a really killed child process.
- **D60 (Toolbox), feature-request admit after a half-finished claim:** the second admit threw `CPP-SESSION-ADMISSION` from the existing-packet branch.
  Now it resumes the claim when candidate, task id and preflight digest match; any mismatch rethrows. The "different task, same target" case was refuted
  by the code (targets are built from the declaration task id) and is pinned.
- **Verify registration of `critic-packet-release.test.mjs`** (D60 c10) with its case ids, completion config and the pinned list.
- **Inventory suite green (c14):** PCI16's fixture gets a Source-issued origin record (the gate is untouched); PCI24's `architecture-measure.mjs`
  entry point is named in the architecture-orientation reference of the pipeline-start skill (checker unchanged, no allowlist); PCI30 followed by itself.

## Test evidence (fresh clone, both patches applied as ONE commit)

The inventory, case-completion and finalizer rows and the orientation row were run on the fresh chain clone with both patches; the other rows were
run on the compose clone with the bundle alone (the increment touches no file those suites cover).

| File | tests | pass | fail |
|---|---|---|---|
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `lib/critic-packet-release.test.mjs` | 5 | 5 | 0 |
| `lib/critic-generic-batch.test.mjs` | 33 | 33 | 0 |
| `lib/critic-verify-lifecycle.test.mjs` | 7 | 7 | 0 |
| `lib/architecture-adoption-orientation.test.mjs` | 6 | 6 | 0 |
| `scripts/critic-packet-preflight.test.mjs` | 17 | 17 | 0 |
| `scripts/critic-dispatch-preflight.test.mjs` | 48 | 48 | 0 |
| `scripts/session-critic-finalizer.test.mjs` | 74 | 73 | 1 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current".
The one finalizer failure is the pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails
identically on the unchanged baseline. Full Verify is not run for this bundle.

**Commit shape matters:** the inventory case PCI17 reads `HEAD^`. With the two patches committed as TWO commits the suite shows 28 of 30 (PCI17 and
PCI30 red); as ONE commit it is 30 of 30. Commit once. (Why PCI17 depends on the commit shape is not diagnosed; it is named for the Critic.)

## Named gaps and gates (not done)

- **Faithful emulation, not the consumer's disk:** the PF-93 green cases run on a legacy chain built with the real previous build; the Glossover
  consumer's own packet is not available to this repository. The next Glossover run is the real test.
- **c10 widened the VCR01 pin list:** the pinned list in `check-verify-case-completion.test.mjs` was restated wider than the 12 pins of this change
  (18 further suites and a converted identity). The batch Critic has to read that hunk.
- **Unpinned cases:** a different-candidate case on the feature-request path; a release after a recovery; a lock older than the owner-record code
  (`CGB-RECOVERY-OWNER-UNPROVEN`, pinned, no evidence it exists).
- **Decision for the PO:** whether "different task, same target" should ever be a held case (today it cannot occur).
- The c13 lineage compile run is not done. Full Verify, batch Critic, native Windows (D58/D59/D60), D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply both and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-round3-followup-bundle-v2-2026-10-28.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-inventory-pci16-pci24-baseline-reds-c14.patch`
then `git status --short` (expect 14 changed paths: 12 from the bundle, plus `harness/scripts/check-product-capability-inventory.test.mjs` and
`plugins/pipeline-core/skills/pipeline-start/references/architecture-orientation.md`).

Block 2, stage with a path limit and commit ONCE with your own ceremony:
`git add -A -- plugins/pipeline-core harness architecture`
`git commit --no-verify -F scratch/commit-msg-po-apply-v2.txt`

Block 3, tell the Elephant. It stamps (`scripts/stamp-candidate.mjs`), then you synchronize the installed plugin copy per
`docs/push-release-flow.md`; the bundle changes no hook, so no hook refresh is needed beyond the install.
