# Held patch: r2-identity-actor-reuse (AC-264, D152)

Patch: `r2-identity-actor-reuse.patch` (sha256 `4702bab4b279d74dbe10ea1ae7ddcbe1c99b6121ed1e95982f73e410c222a75e`, 29565 bytes).
Candidate: `82f781b08c2ad65992bbc608803dfcc420a2a42c`. Applies on top of the committed
`lib/pipeline-actor-assignment.mjs` and the rewritten (kernel-independent) intake-author test.

## Preimage SHA-256 (at the candidate)

| File | SHA-256 |
|---|---|
| plugins/pipeline-core/scripts/onboarding-init.mjs | 6514423e61a1a2894ff623db3187554f6a5fd2c9f1a8ad0b7beed1376b34f77d |
| plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs | 359c05fc99431d8da1cd94c15b7b48c2323a2c4c57ea5c2395b5e9e1991d4d89 |
| plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs | 71fa86793afaacaf3d9b3f66630b441fc24c180edb4dd5b52103a398c2b1a5cb |
| plugins/pipeline-core/scripts/onboarding-init.test.mjs | 808a17fafec4ee3b4bb987746ff9c189290fcee16c7d2b83f3cb55b17b161bde |
| plugins/pipeline-core/scripts/onboarding-init-intake-author.test.mjs (pre-rewrite) | bf536424ff9c5da16b65d9b026d1ba8d992555c9b924a7d824b7c53b7c68a03c |

Post-rewrite: intake-author test `a293e4e28a76b48ffe7e21563c70be30fde45abbe35b6ada0c69afdc80d73869`,
lib `4712fe18951b9b5c8bfda90263ce706d783b5bf380d51d2d7ca525645cddb904`.

## Apply check

`git apply --check` in a scratch clone of the candidate (lib and rewritten test copied in): exit 0, all four
kernel/test files checked clean. The intake-author test hunk is the diff from the pre-rewrite file to the rewritten one.

## Counts (work copies, evidence under scratch/agent-out/w2-identity-cont/evidence/)

| Suite | RED before | GREEN after |
|---|---|---|
| onboarding-init-intake-author | 6 tests / 3 pass | 6/6 |
| guard-lifecycle-ready | 394 / 390 pass / 1 fail | 394 / 391 pass / 0 fail |
| onboarding-init | 56/56 | 56/56 (green3) |

The repository intake-author test file is kernel-independent and green 6/6 on the unmodified kernel.

## Coordinator decisions applied

1. The guided-driver argument `--pipeline-actor` is added to the sanctioned driver args (`sanctioned-args-scripts.mjs`)
   so the guard admits it at every non-ready reading, matching the other guided-driver answers
   (guard-lifecycle-ready test gains the matching admission case).
2. The ask list in onboarding-init.test.mjs (deep-compared asks) gains the jointly asked actor question, and the
   two deep-compare expectations are updated accordingly; this is an expectation change tied to AC-264 (actor asked
   once, jointly with the Git author), not a weakening.

## Safety

- Attribution only: the actor label is never an approval; approval verbs are excluded from the closed scope set
  (submit-plan, present-plan, close-feature, push-init).
- An invalid label is refused before any write.
- Stored in a private 0600 file next to the first-answers receipt; no personal identity appears in public Resume-Hints.
- `pipeline-state.mjs --by` suggestions using the stored actor remain a later slice (C3).

## Overlap with other held patches (guard-lifecycle-ready.test.mjs)

Our hunk is at ~line 3075. k55-guard-lifecycle-ready-test-posix-command-paths.patch hunks: 233, 1346, 1911, 1932,
2040, 7346, 7405, 7456, 7470, 7481, 7504, 7557. r2-preready-ref-git.patch hunks: 1190, 1208, 1241. No range overlaps;
only line offsets shift (apply with fuzz-free offset tolerance, `git apply` handles offsets).

## Proposed commit message

feat(onboarding): ask the Pipeline actor once with the Git author and reuse it after restart
