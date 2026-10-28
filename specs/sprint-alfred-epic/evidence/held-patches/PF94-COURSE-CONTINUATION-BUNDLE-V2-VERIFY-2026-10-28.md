# PF-94 course-continuation bundle v2, verification and PO apply blocks (2026-10-28)

One patch, applied and committed as ONE commit:

`w7-pf94-course-continuation-bundle-v2-2026-10-28.patch` (9 files, +778/-7). It supersedes `w7-pf94-course-continuation-bundle-2026-10-28.patch`
(v1, 8 files) by adding the c18 increment (the VCR01 pin). Do not apply v1 as well.

Base: repository HEAD at the commit that holds this document (the patch applies with `git apply` on a fresh clone of HEAD). This is a HELD PATCH:
nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so. `plugins/pipeline-core/lib/guard/command-catalogue.mjs`
and its pin test are guard files: the PO applies this patch as operator.

## Why this bundle

Glossover (PF-94) could not run Critic round 2 of its course by any sanctioned route. Round 1 had run as a generic batch, so the course had no
history; no sanctioned command wrote the lineage record of a consumed round or the delta request of the next one. PO decisions: a rerun of round 1
is acceptable, and the takeover is a narrow audited command.

- **c15 takeover:** `session-critic-finalizer.mjs` gets `inspect-course-takeover` (read-only, prints status and digest) and `supersede-course-takeover`
  (digest and reason bound) for the work ids of a consumed non-course batch while the course has no history.
- **c16 lineage writer:** `register-feature-package.mjs --add-review-lineage --packet <32hex>` registers a `pipeline.critic-review-lineage` record
  bound to the consumed receipt; refusals `FPR-LINEAGE-*`.
- **c17 delta request writer:** `register-feature-package.mjs --root <r> --add-delta-request <input.json>` builds and registers the delta request of the
  next round; refusals `FPR-DELTA-*`; on success it prints `RE-DELTA-ADMITTED`.
- **Guard shapes and pins (c2):** the two argument shapes are admitted in `sanctionedRegisterFeaturePackageArgs`; pin tests 23 to 24.
- **c18:** the VCR01 pin of the `critic-course-admission-tests` row moves from 146 to 213 (the bundled cases).

## Test evidence (fresh clone of HEAD, the patch applied as ONE commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 61 | 61 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 33 | 33 | 0 |
| `plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` | 24 | 24 | 0 |
| `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` | 78 | 77 | 1 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". The one finalizer failure is the pre-existing
`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails identically on the unchanged baseline (74 tests, 73 pass).
Full Verify is not run for this bundle.

## Named gaps and gates (not done)

- **No real Glossover retest yet.** The cases run on fixtures; the next Glossover run is the real test.
- **Path after the admitted delta is not walked:** preflight of round 2, claim, finalize, export and the lineage of round 2 are not exercised end to end.
- **Untested refusals:** `FPR-LINEAGE-COVERAGE-CLAIM`, `CGB-TAKEOVER-COURSE`; the c15 upgrade-state reproduction on the previous build is covered only through the bundle run.
- **Operator docs:** SKILL.md / implementation-continuation.md and the `--help` text for the new verbs are not written.
- **Commit shape:** the inventory case PCI17 reads `HEAD^`; commit once.
- Full Verify, batch Critic, native Windows (D58 to D61), D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-course-continuation-bundle-v2-2026-10-28.patch`
then `git status --short` (expect 9 changed paths: 8 under `plugins/pipeline-core` and 1 under `harness/scripts`).

Block 2, stage with a path limit and commit ONCE with your own ceremony:
`git add -A -- plugins/pipeline-core harness`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf94.txt`

Block 3, tell the Elephant. It stamps (`scripts/stamp-candidate.mjs`), then you synchronize the installed plugin copy per
`docs/push-release-flow.md` and run `refresh-mandatory-hooks.mjs`.

## Order for Glossover after the install

1. `inspect-course-takeover`, then `supersede-course-takeover` (digest and reason).
2. Rerun round 1 on the course path.
3. `register-feature-package --add-review-lineage --packet <id>` BEFORE the next correction commit.
4. Correction commit; produce and register the diagnostic evidence.
5. `register-feature-package --add-delta-request <input.json>` (the map must cover every printed changed path), commit, then round 2 preflight.
