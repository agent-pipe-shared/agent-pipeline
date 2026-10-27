# W7 D47: onboarding seeds evidence line-ending attributes (PARTIAL: RED cases only, no production code)

Slice W7-D47-GITATTRIBUTES-ONBOARDING-C1-20261027, candidate 1bf345155d9b8da6f30b6d0fd63bf31f0421937b. Budget ended at the checkpoint.
Targeted delivery: BLOCKED. Batch Critic review and PO acceptance stay parent-owned and pending.

## Cause
Onboarding seeds no `.gitattributes`; the recon note (w7-recon-gitattributes-migration.notes.md) cited lines were re-read and hold at the
candidate: `planProjectOnboardingV3` line 5700, `seedsProjectIgnore` 5714, `.gitignore` target 5732, kind mapping 5744, `missingProjectIgnorePatterns`
5795, `collectProjectIgnoreGapAction` 5829, apply attach 6267-6272, `pendingAsks` list 6927, `withPendingProjectIgnoreGapAsk` 7221, composition 7240.
No contradiction found.

## Attribute lines (decision: eol=lf, not -text)
`specs/**/evidence/** text eol=lf` and `evidence/** text eol=lf`. Pattern strings VERIFIED with `git check-attr` in a temp repository
(driver mode `attr`, output): specs/f1/evidence/a.log, specs/f1/evidence/sub/b.json, specs/evidence/c.log, evidence/d.log, evidence/x/e.log all
`text: set`, `eol: lf`; src/f.js `unspecified`. Note: line 2 is a suffix of line 1, so a substring check cannot tell them apart (test GA-5 uses a lookbehind regex).

## Delivered (patch: w7-d47-gitattributes-onboarding.patch, test file only, 86 inserted lines)
Five RED cases appended after the last `test(` (before `FRESH_ENROLLMENT_REGRESSION_CASES`): D47-GA-1 (fresh seed, exact bytes, git check-attr agrees),
D47-GA-2 (idempotent re-plan), D47-GA-3 (owned file with the lines: no ask, bytes unchanged), D47-GA-4 (owned file lacking them: ask, `mutation:false`,
exact lines named, bytes unchanged), D47-GA-5 (owned file with other content/CRLF never rewritten; partial file asked only for the missing line).
Ask key used by the cases: `projectAttributesGapAction`. Apply check in clone2 at the candidate: see driver `check` result below.

## RED/GREEN status: NOT achieved
- Patched whole-file run (clone): exit 1, aborted by `assert.equal(declared, EXPECTED_CASE_COUNT, "the suite must declare all 216 stable callbacks")` at
  test line ~10622: `221 !== 216`. The five new cases therefore did NOT execute; the RED run proves only the declared-count pin. The follow-up must raise
  `EXPECTED_CASE_COUNT` (and the message text) from 216 to 221 in the same patch, with that justification (new cases, none removed).
- Baseline whole-file run (clone2, unchanged candidate): exit 1 with PRE-EXISTING failures: SECGATE-1 ("fully-satisfied push must be admitted ...
  private-critic-binding-unavailable"), "public onboarding handover is executable for every runner ... antigravity: configure verify", chunk 0 shards 0-4
  all exit 1. Failing-name comparison baseline vs patched was therefore NOT possible; the full tail is in scratch/agent-out/w7pp/base.*.log (deleted with cleanup is not done; logs stay).

## NOT done
All production code in `lib/project-onboarding-v3.mjs` (seed constant, `project-attributes` target kind at 5732/5744, content-based gap check, apply attach at
6267, `pendingAsks` entry at 6927, re-probe wrapper at 7221 and composition at 7240); GREEN run; whole-file comparison; the writer for existing repositories
(needs a new guard-catalogue route, native-host-only); a preflight readback line; a real Windows run without core.autocrlf=input (native-host-only).
Expected knock-on edits for the follow-up (existing cases that pin deliberately changed behaviour; justify in the notes): the three plan target lists at test
lines ~2810, ~7511, ~7677 gain ".gitattributes" before ".gitignore" (localeCompare order); test line ~3279 key list may need `projectAttributesGapAction`;
the declared-count constant 216 -> 221.
Weakness to fix: GA-2's "no target on re-plan" is trivially true (plan on an onboarded root returns no targets, line 5702); a stronger form pre-seeds only
`.gitattributes` and plans.

## Proposed commit message
feat(onboarding): seed evidence line-ending attributes and disclose the gap in an existing repository

## Operator flow
apply-diff the patch, `git add -u` with a path limit, `--no-verify` commit, stamp, install. Protected-path classification: the test file matches none of
TP-1..TP-13; no guard-catalogue/protected file is touched by this partial.

## Open
Independent Critic review remains a parent-owned batch gate. Budget ended early because ~14 calls went to orientation reads and one blocked rg flag.

CONTINUATION CARD -- done: recon re-verified, patterns verified with check-attr, five RED cases written, patch+apply check; remaining: production edits
(5 regions), raise declared count to 221, update three target lists, GREEN, whole-file compare with baseline pre-existing failures; next step: follow-up dispatch.
