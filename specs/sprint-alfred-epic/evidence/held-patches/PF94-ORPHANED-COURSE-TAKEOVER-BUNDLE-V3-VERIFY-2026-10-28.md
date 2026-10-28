# PF-94 orphaned-course takeover bundle v3, verification and PO apply blocks (2026-10-28)

One patch, applied and committed as ONE commit:

`w7-pf94-orphaned-course-takeover-bundle-v3-2026-10-28.patch` (4 files, +81/-5), composed from the held patches c19 and c19b. It applies on the
installed PF-94 candidate (`0.7.0+claude.20261028151938.d2a0f0f`, stamp `dd16c6935`) and replaces nothing. This is a HELD PATCH: nothing in it is applied,
stamped, installed, reviewed or accepted until the PO has done so.

PO decision (2026-10-28, question tiles): the takeover may also retire a consumed feature-course batch of ANOTHER course key that has no registered
lineage (narrow extension of the earlier decision), and a consumer may rerun round 1 on the course path after the install.

## Why this bundle

The first real run of the installed PF-94 build on a consumer repository ended in a dead end:

- `inspect-course-takeover` printed `originKind: feature-course`, an owner course key (`75b29a71…`) different from the requested one (`0e48762b…`),
  all packets consumed, `courseHistoryRegistered: false`, `refusalCode: CGB-TAKEOVER-COURSE`.
- `register-feature-package --add-review-lineage --packet <id>` ended in `FPR-LINEAGE-TRANSPORT` (`CCA-TRANSPORT-SOURCE-DRIFT`): correction commits followed
  round 1, so the lineage can no longer be registered retroactively.
- A fresh course cannot admit: the old batch owns the logical work ids (`CGB-CONFLICT`), and the takeover refused every feature-course owner.

Cause: round 1 had run on the course path under an earlier genesis course key, its lineage was never registered (no writer existed), and the course key
of a feature without history derives from the genesis candidate of the current request (`critic-course-admission.mjs` 446 to 450). The takeover (c15)
assumed an owner outside the course and refused all feature-course owners.

## What changes

- **`critic-generic-batch.mjs` (c19):** `takeoverState` refuses `CGB-TAKEOVER-COURSE` only when the owner course key EQUALS the requested key (the same
  course; its lineage cannot be reset). An owner of another key continues through the unchanged checks: registered history gives `CGB-TAKEOVER-HISTORY`,
  an unconsumed packet `CGB-TAKEOVER-OPEN`, otherwise the takeover is admissible. `courseHistoryRegistered` means the feature has ANY registered lineage
  (`session-critic-finalizer.mjs` line 53), so an old key with lineage cannot coexist with false. The repair text of `CGB-TAKEOVER-COURSE` now names
  `register-feature-package --add-review-lineage --packet <id>` before the next correction commit, else delta mode; the `CGB-CONFLICT` detail says the
  batch may belong to an earlier course key and that the takeover verbs retire it. The supersede verb needed no change.
- **Tests (c19, c19b):** `CGB034` in `critic-generic-batch.test.mjs` (same key refused with the lineage hint, other key with history, other key unconsumed,
  conflict text); `PF94 TAKEOVER (5)` in `session-critic-finalizer.test.mjs` on a batch built through the real course path (inspect null, supersede, audit,
  moved files, nothing deleted, ownership of the NEW key claimed false, replay idempotent). Its first origins assertion was too strict: the delivery-target
  index entry of the old packet legitimately stays (it only blocks a reserve with the SAME delivery target), so the case now requires exactly that one
  remaining entry and that the feature-course origin was the one that moved.
- **VCR01 pin (c19b):** the row `critic-generic-batch-tests` moves from 66 to 74 in `check-verify-case-completion.test.mjs`.
- **Dropped by the Elephant:** the Goldfish also widened the completion policy list in `verify-case-completion-augmentations.v1.json` from CGB001..011 to
  CGB034. That is not needed (the policy is a subset of the declared ids) and would demand 23 more dispositions in Verify, so the hunk is not in the bundle.

## Test evidence (fresh clone of HEAD, the patch applied as ONE commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` | 79 | 78 | 1 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 34 | 34 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 61 | 61 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". The one finalizer failure is the pre-existing
`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails identically on the unchanged baseline. Full Verify is
not run for this bundle.

## Named gaps and gates (not done)

- **Not tested on a consumer repository.** The case builds the old batch through the real course path of the fixture, not from the consumer's disk. The
  next consumer run is the real test.
- **Untested refusal:** `FPR-LINEAGE-COVERAGE-CLAIM`. The path after the admitted delta (preflight of round 2, claim, finalize, export, lineage of round 2)
  is not walked end to end.
- **Operator documentation of the four verbs is still missing** (skill text, `--help`), and it is the reason the consumer did not find the order. A separate
  slice is next.
- Full Verify, batch Critic, native Windows (D58 to D61), D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-orphaned-course-takeover-bundle-v3-2026-10-28.patch`
then `git status --short` (expect 4 changed paths: 2 under `plugins/pipeline-core/lib`, 1 under `plugins/pipeline-core/scripts`, 1 under `harness/scripts`).

Block 2, stage with a path limit and commit ONCE with your own ceremony:
`git add -A -- plugins/pipeline-core harness`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf94-v3.txt`

Block 3, tell the Elephant. It stamps (`scripts/stamp-candidate.mjs`), then you synchronize the installed plugin copy per `docs/push-release-flow.md` and
run `refresh-mandatory-hooks.mjs`.

## Order for a consumer after the install

1. `inspect-course-takeover` (expect `refusalCode: null`, a different owner key), then `supersede-course-takeover` with the digest and a short reason.
2. Rerun round 1 on the course path (PO approved the Opus run, budget limit PF-92).
3. `register-feature-package --add-review-lineage --packet <id>` BEFORE the next correction commit.
4. Correction commit; produce and register the diagnostic evidence.
5. `register-feature-package --add-delta-request <input.json>` (the map must cover every printed changed path), commit, then the round 2 preflight.
