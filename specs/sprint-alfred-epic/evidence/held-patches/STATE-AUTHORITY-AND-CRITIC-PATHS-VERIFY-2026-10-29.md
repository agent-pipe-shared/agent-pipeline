# State authority diagnostics and memo, and the Critic route path rule: verification and PO apply blocks (2026-10-29)

Nine patches, applied in this order, in two commits (patch 4, `w7-state-authority-trace-memo-e3`, and patch 9, `w7-critic-path-charset-f4`, were added after the first version of this note). This is a set of HELD PATCHES: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so. It supersedes the apply
blocks of `STATE-AUTHORITY-DIAGNOSTICS-VERIFY-2026-10-28.md` (which covered only the first two patches). All nine apply on HEAD of the working branch in this order; the first patch of each commit must
never be applied alone (the second corrects it).

| # | Patch | Content |
|---|---|---|
| 1 | `w7-state-authority-diagnostics-e1b` | refusal line names an untyped cause and the elapsed time; opt-in `AUTHORITY-TRACE` line; counters in the git custody read and both Windows native modules |
| 2 | `w7-state-authority-diagnostics-e1c` | corrects 1: code alone in the parenthesis, cause as a clause after it; cases run in the repair suite |
| 3 | `w7-state-authority-memo-e2` | process-local memo for the six read-only operations of the Windows owned-authority backend, stats `authorityMemoHits/Misses/Size`, import-only test seam, cases SAS09 to SAS17, count pin |
| 4 | `w7-state-authority-trace-memo-e3` | the `AUTHORITY-TRACE` line carries an `authorityMemo` object (hits, misses, size) built by the exported pure `buildAuthorityTrace`; cases SAS18 and SAS19; count pin 276 to 288 |
| 5 | `w7-critic-path-charset-f1` | lineage core, review-economy (two patterns), course admission and diagnostic evidence accept every legitimate file name character |
| 6 | `w7-critic-path-charset-f1-c2` | corrects the economy case helper (stale compiled-request digest) |
| 7 | `w7-critic-path-charset-f2` | the path patterns of four JSON schemas (lineage, review attempt, course decision, release scope) |
| 8 | `w7-critic-path-charset-f3` | walk case `CPP18`: a real candidate packet with eight special file names through the route |
| 9 | `w7-critic-path-charset-f4` | case `PF97 LINEAGE (special file names)`: the real registration route of a consumed course round (preflight, admission, finalize, `addCriticReviewLineage`) with the same eight names; fixture option `extraCandidateFiles`; VCR01 pin 232 to 238 |

## What the Critic path rule is now (PO decision 2026-10-28)

Everything a repository file name can legitimately carry is allowed. Refused stay: control characters (U+0000 to U+001F, U+007F to U+009F, so NUL and line breaks), the backslash, a leading slash, an empty
segment and the segments dot and dot-dot. Length limits are unchanged in each place. A colon, a trailing space or dot, a leading dash, brackets, parentheses, at sign, dollar, plus, equals, comma, tilde,
percent, hash and non-ASCII letters are accepted. Bidirectional override characters are not refused (they are legal in names); this is a named residual, decide if you want them refused.

## Test evidence (fresh clone, all patches applied in order, measured by the Elephant; the table was measured with eight patches on `42659f0e3`; after patch 9 on `c3f08c3ae` critic-course-admission is 66 of 66 and check-verify-case-completion 32 of 32, the other rows unchanged)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` | 40 | 40 | 0 |
| `harness/scripts/pipeline-state-external-push-ledger.test.mjs` | 1 (5 checks) | 1 | 0 |
| `plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs` | 18 | 18 | 0 |
| `plugins/pipeline-core/lib/review-economy.test.mjs` | 1 (own checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-review-lineage.test.mjs` | 1 (own checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |
| `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs` | 13 | 13 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 35 | 35 | 0 |
| `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` | 63 | 63 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check`: "Architecture overview current". The walk case fails without patches 5 to 7 (patch 8 alone on HEAD: 18 tests, 16 pass, 2 fail).
`session-critic-finalizer.test.mjs` has one pre-existing red case (86 of 87), identical on the unpatched baseline; `harness/scripts/pipeline-state.test.mjs` stops at its case PS08a in the baseline: both are
recorded open baseline reds and unrelated to these patches. Full Verify is not run.

## Named gaps and gates (not done)

- Memo: no native Windows run was possible; the memo is exercised only with a fake spawn. Residual risk: a change that does not move the stat identity tuple within one command run is not seen. The memo
  counters are in `nativeAuthorityStats()` and, with patch 4, in the `AUTHORITY-TRACE` line (`authorityMemo`: hits, misses, size). The effect must be measured on native Windows with
  `PIPELINE_AUTHORITY_TRACE=1` before and after. The Goldfish saw `pipeline-state-external-push-ledger.test.mjs` fail (PSXL05) in its scratch clone on patched AND unpatched code; it passes 1 of 1 on the
  Elephant clone, so that was an environment effect of the scratch clone, not of the patch.
- Critic path rule: patch 9 drove the registration route of a consumed course round up to the registered lineage with eight special file names and found no further refusal (without patches 5 to 8 the same case
  fails at `addCriticReviewLineage` with status `refused`, the consumer failure). Printed hints that interpolate a path unquoted into a command were surveyed only in part (the register-feature-package,
  add-diagnostic-evidence and add-delta-request hints use placeholders); the other hint sites stay with the next slice. The JSON schemas are only read by tests (no runtime validator library applies them, checked by search).
- Full Verify, the batch Critic, the native Windows gates (D58 to D61), D31 native qualification, the real consumer retests and PO acceptance stay open.

## PO apply blocks (from the repository root)

Block 1 (state authority):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1b.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1c.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-memo-e2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-trace-memo-e3.patch`
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-state-all.txt`

Block 2 (Critic path rule):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f1.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f1-c2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f3.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f4.patch`
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-critic-paths.txt`

Block 3, tell the Elephant: it stamps, you refresh the installed plugin copy and install, the Elephant reads the preflight back. The consumer then runs the failing round-2 registration again; a refusal that
names a different place is reported with its exact code and message.

## For the Windows consumer after the install

Run the previously slow command once with `PIPELINE_AUTHORITY_TRACE=1` (PowerShell: `$env:PIPELINE_AUTHORITY_TRACE='1'`, the command, `Remove-Item Env:PIPELINE_AUTHORITY_TRACE`) and send the one `AUTHORITY-TRACE`
line plus the refusal line, if any. For a comparison run the same command with `PIPELINE_AUTHORITY_NO_MEMO=1` (the memo off).
