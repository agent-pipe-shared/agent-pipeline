# Round-3 held-patch bundle v1, verification and PO apply blocks (2026-10-28)

Bundle: `w7-round3-bundle-v1-2026-10-28.patch` (14 files, +590/-33, 4 patches). It stacks on the tree that
contains the round-2 bundle v5 (installed at c0b837599, stamped at 638aef7bf). It applies cleanly with `git apply` on a fresh clone
of the repository HEAD 097b4cad5 (patches applied and committed one by one, 4 of 4 OK). It is a HELD PATCH: nothing in it is
applied, stamped, installed, reviewed or accepted until the PO has done so. No changed file is a protected path
(no `lib/guard/*`, no `scripts/pipeline-state.mjs`), so an agent-side commit is not blocked by the protected-path pre-commit hook.

## Contents, in apply order

1. `w7-pf85-continuation-of-c3` — PF-85 slice 1a: a declared continuation of a still-reserved predecessor
   (the native Goldfish host state/return and slice-queue files in the bundle; see its notes file
   `w7-pf85-continuation-of-c3.notes.md` for the exact change).
2. `w7-d52-close-gate-and-commit-route-check-c2` — D52 clause B: the close coordinator refuses a scheduled Critic slice
   (`CLOSE-CRITIC-SLICE-SCHEDULED`) and the commit route check, with a pin test. Clause A of D52 (onboarding checks the commit route
   early) needs no patch: the parent re-checked after the recon note and found production code in `pipeline-start-preflight.mjs`
   (typed `HOOK-SNAPSHOT-STALE` for every stale mandatory hook, status `hook-refresh-required`, AC-179) and existing pins
   (`pipeline-start-preflight.test.mjs` "P2 (preflight, behavioural)", `lib/pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs`).
   The recon note's "no pin found" only looked at the pre-push hook cases.
3. `w7-d58-d59-windows-dir-fsync-and-attested-scope-hint-c2` — D58: a refused directory fsync no longer aborts the generic
   Critic batch admit with `CGB-PHYSICAL` (Windows); D59: the attested dispatch-record scope refusal names its repair.
   Verified on Linux only; the Windows behaviour needs the native run.
4. `w7-pf93-critic-packet-version-skew-c11` — PF-93: a Critic packet claimed before the binding assurance field finalizes end to end.
   The legacy pre-assurance form is accepted only through the explicit `allowLegacyPreAssurance` option (default strict), passed
   by the claimed-packet reads, record, consume and cleanup paths; prepare, claim and publish stay strict; the hidden admission
   cause is named; skip coverage accepts the exact legacy binding. c1 to c10 are superseded drafts: never apply them.

## Test evidence (composed clone, the 5 touched test files, `node --test <file>`)

| File | tests | pass | fail |
|---|---|---|---|
| `lib/critic-generic-batch.test.mjs` | 33 | 33 | 0 |
| `lib/native-goldfish-host-state.test.mjs` | 58 | 58 | 0 |
| `lib/pins/close-coordinator-refuses-a-scheduled-critic-slice.test.mjs` | 7 | 7 | 0 |
| `scripts/dispatch-authorship-verify.test.mjs` | 74 | 74 | 0 |
| `scripts/session-critic-finalizer.test.mjs` | 47 | 46 | 1 |

The one failure is the pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails
identically on the unchanged baseline (39 tests, 38 pass, 1 fail). In the single-patch clone runs for PF-93, `critic-packet-preflight`
(17/0, CPP09 and CPP15 green, no pin touched) and `check-critic-skip-coverage` (48/0) were also green. The full Verify is not
run for this bundle.

## For the batch Critic

PF-93 and D58/D59 sit on the Critic admission and finalization path (kernel path). Read `critic-packet-preflight.mjs`
`normalizeCoordinatorOnly` (the option and its exact key-set rule) and each `packetContext` caller. Callers deliberately left strict:
export, consumed-snapshot readers and block; a later export or read-back of an already finalized legacy packet is still refused.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-round3-bundle-v1-2026-10-28.patch`
then `git status --short`.

Block 2, stage with a path limit and commit with your own ceremony: `git add -A -- plugins/pipeline-core`.

Block 3, synchronize the installed plugin copy and install per `docs/push-release-flow.md`; the stamp is done by the Elephant
(`scripts/stamp-candidate.mjs`) after you tell it the install is done.

## Decisions only the PO can take

- PF-93 option (B): a release command for an already finalized legacy packet (export, read-back). Without it those paths stay strict.
- D31 resume without manual cancel: option A (own finalizer slice that ends in-place SendMessage resume) or option C. Not in this bundle.
- Deep tier or a larger tool budget for kernel slices (the Sonnet/medium 40-call budget needed three to four passes per kernel slice).
- D58/D59 needs the native Windows run (the D52 clause A gap named earlier is closed by existing code and pins, see patch 2).

## Not in this bundle

D31/D32, PF-93 option B. Critic, Full Verify, native Windows run and PO acceptance stay open. After install the matrix rows
of PF-85, D52, D58/D59 and PF-93 may be lifted to 75; the Windows proof of D58/D59 stays a named gate.
