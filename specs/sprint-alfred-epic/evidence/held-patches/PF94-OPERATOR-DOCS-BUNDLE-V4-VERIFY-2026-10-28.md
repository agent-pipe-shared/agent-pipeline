# PF-94 operator documentation bundle v4, verification and PO apply blocks (2026-10-28)

One patch, applied and committed as ONE commit:

`w7-pf94-operator-docs-bundle-v4-2026-10-28.patch` (7 files, +119/-11), composed from the held patches c20 and c20b. It applies on the repository HEAD
after the v3 takeover bundle (commit `35fb9c3a6`, stamp `a0957c150`, not yet installed). This is a HELD PATCH: nothing in it is applied, stamped,
installed, reviewed or accepted until the PO has done so.

## Why this bundle

The four verbs that continue a Critic course past a consumed first round (`inspect-course-takeover`, `supersede-course-takeover`,
`register-feature-package --add-review-lineage`, `register-feature-package --add-delta-request`) existed without operator documentation. That is the
reason Gloss Over did not find the order. The patch documents them where an operator and an agent look first and names the late-lineage repair in the
refusal texts that used to dead-end.

## What changes

- **`register-feature-package.mjs`:** `--help` names the lineage verb and the delta request route, with the order and the "before the next correction
  commit" rule.
- **`feature-package-registration.mjs`:** the reason sentences of the lineage and delta refusals name the repair.
- **`session-critic-finalizer.mjs`:** the `SCF-TAKEOVER-REQUEST` text and `CLI_HELP` describe inspect then supersede.
- **`skills/critic-review/SKILL.md`:** a section "Continuing a Critic course" with the five-step order.
- **`references/implementation-continuation.md`:** a pointer to that section.
- **Tests (c20):** `critic-course-admission.test.mjs` cases `PF94 DOCS (a)` to `(d)` pin the help text, the reason sentences, the finalizer texts and the
  skill section.
- **VCR01 pin (c20b):** the row `critic-course-admission-tests` moves from 213 to 232 in `check-verify-case-completion.test.mjs`; nothing else changes
  there and no assertion is weakened.

## Test evidence (fresh clone of HEAD, the patch applied as ONE commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 34 | 34 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` | 24 | 24 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |
| `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` | 79 | 78 | 1 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". The one finalizer failure is the pre-existing
`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails identically on the unchanged baseline. Full Verify is
not run for this bundle. The c20 patch alone left case-completion at 31 of 32 (VCR01); c20b is the increment that makes it 32 of 32.

## Named gaps and gates (not done)

- **Not tested on the Glossover repository.** The next Glossover run is the real test.
- **Untested refusal:** `FPR-LINEAGE-COVERAGE-CLAIM`. The path after the admitted delta (preflight of round 2, claim, finalize, export, lineage of
  round 2) is not walked end to end.
- Full Verify, batch Critic, native Windows (D58 to D61), D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-operator-docs-bundle-v4-2026-10-28.patch`
then `git status --short` (expect 7 changed paths: 6 under `plugins/pipeline-core` (lib, scripts, `skills/critic-review/SKILL.md`, `skills/pipeline-start/references/implementation-continuation.md`), 1 under `harness/scripts`).

Block 2, stage with a path limit and commit ONCE with your own ceremony:
`git add -A -- plugins/pipeline-core harness`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf94-v4.txt`

Block 3, tell the Elephant. It stamps once (`scripts/stamp-candidate.mjs`), covering the v3 takeover bundle and this documentation; then you
synchronize the installed plugin copy per `docs/push-release-flow.md` and run `refresh-mandatory-hooks.mjs`. The stamp `a0957c150` is superseded and
is not installed.

## Order for Glossover after the install

1. `inspect-course-takeover` (expect `refusalCode: null`, a different owner key), then `supersede-course-takeover` with the digest and a short reason.
2. Rerun round 1 on the course path (PO approved the Opus run, budget limit PF-92).
3. `register-feature-package --add-review-lineage --packet <id>` BEFORE the next correction commit.
4. Correction commit; produce and register the diagnostic evidence.
5. `register-feature-package --add-delta-request <input.json>` (the map must cover every printed changed path), commit, then the round 2 preflight.
