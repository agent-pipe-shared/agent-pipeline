# K143-FV-TOOLING notes (clone scratch/clones/k143, base 714dea68e; ruleset 0.7.0+claude.20261023185750.bd9ee06)

Clone commits: 58a0c9e33 V1, 48102ae21 V2, e010e3a7f V3 recovery entry, a77267ae2 V4, bc228b4e5 V3 test.
Diffs: K143-FV-TOOLING-unprotected.diff (all five commits), K143-FV-TOOLING-protected.diff (check-verify-suite-append.mjs only).
Both `git apply --check` and apply cleanly in scratch/clones/k143-check. Messages: -msg-unprotected.txt, -msg-protected.txt.

## V1 skill budget
- Cause: the limit (24 * 1024) is asserted in PSV08 of plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs and again
  as SKILL_MAX_BYTES in plugins/pipeline-core/lib/pins/greenfield-machine-output-and-skill-budget.test.mjs (AC-192): the mandatory skill is read
  at every session start. SKILL.md was 24673 B.
- Fix: four passages tightened (onboarding-init history clause, relay-verbatim restatement, single-option wording, card-never-a-gate restatement):
  24673 -> 24373 B (300 B saved, 203 B headroom). No rule, command, status name or pointer removed; the K139 `subagentModelEnv.status` sentence untouched.
- Pins: no suite pins the changed sentences; no sha256 pin of SKILL.md in inventory, protected-baseline, bootstrap-receipt or payload-measure
  (the payload measure reads the file live). Nothing to regenerate; the dev-build stamp is a separate re-stamp. generate-elephant-role-prohibitions block untouched.
- After: pipeline-start-v3 8/8, greenfield skill-budget pin 15/15, bootstrap-payload-measure 5/5, generate-elephant-role-prohibitions 13/13,
  session-bootstrap-directory-contract 5/5, draft-phase-guard pin, agy-driver pin, bootstrap-should-refresh pin, capability-inventory 30/30, consumer-safe-paths 9/9 all green.
  Before: both budget suites red (classifier). codex-critic-host.test.mjs: 2 of 137 red (CCH136, CCH137) in the same batch; not examined, not verified as pre-existing (no Before run) -- Elephant: re-run in k143-check base.

## V2 semgrep buffer
- Cause: semgrep.mjs run() called spawnSync with no maxBuffer (node default 1 MiB).
- Fix: SCAN_MAX_BUFFER_BYTES = 64 MiB (about 28x the 2.3 MB report, still a hard ceiling). RED first in registered `semgrep-tests`
  (verify.mjs line 723): SEM-B (a) option pin, SEM-B (b) real child writing 3 MB -> RED with ENOBUFS, GREEN after. semgrep.test.mjs 30 tests, 28 pass, 2 pre-existing skips.
  security-scan, semgrep-offline, partial-parsing, failure-provenance, scanner-diagnostics suites green.
- security-scan as verify runs it (private HOME, clone): exit 0, Verdict CLEAN. gitleaks 0, osv SKIPPED (no package sources), license-check 0,
  semgrep PASS 0 findings with degraded coverage: 13 warn-level PartialParsing files (onboarding-continuity*, project-onboarding-v3.test, po-human-approval.test,
  and copies under specs/); that is the PO-sanctioned degraded-coverage path (decision 2026-10-06), not a finding.
- TRIAGE: the classifier's "42 findings" did NOT reproduce. Direct semgrep run (project rules governance/examples/policies/semgrep, 1 GiB buffer) in k143-check,
  a pw-k141 worker clone and the main checkout: results 0, errors 13 (warn/PartialParsing), 2711 files scanned; JSON 1.03-1.18 MB here, not 2.27 MB.
  Hypothesis only: the 42 and 2.27 MB came from a different scan root or rule set in the Full Verify run. Nothing to suppress or allowlist; no scanner config touched.
  Open: confirm in the next Full Verify (security-scan should be green).

## V3 verify-suite-append-history-check
- Cause: 91f728f85 extended caseCompletion.caseIds of four EXISTING rows in place (NGHR, UC02, MFH, K3C) plus one inserted row. The policy admits insertions only, so
  (1) the walk fails at that commit, and (2) the recorded b7c66 restoration no longer binds because the HEAD registry is not an insertion superset of the b7 restored registry
  (failure surfaces as VSA-PRIOR-ENTRY-CHANGED at b7c66, which is why the reported commit was b7c66, not 91f728f85).
- Answer: the sitting change COULD have been append-only: harness/config/verify-case-completion-augmentations.v1.json extends a registered case set with a previousPolicySha256
  binding and a strict-monotone check (RC05C014/15 in the same commit used it). History cannot be rewritten, so the 91f728f85 transition itself needs a recorded exception either way.
- Smallest sanctioned form (protected diff + committed recovery entry): third exception kind `rewrites` in harness/verify-suite-history-recovery.json, same style as the D107
  duplicateRepairs entry: one commit, its parent, both registry sha256, owner Elephant, signed false, reason with "unsigned"/"historical". The witness (evaluateCaseListExtension)
  re-derives from bytes: every prior row unchanged except a strict ordered caseIds extension (same maxBytes/other keys); at least one extension; unique name/file. The b7 binding is then
  proven against the registry just before 91f728f85; later commits stay under the walk. verify-suites.json untouched.
- Measured: on the post-sitting history check-verify-suite-append.mjs exit 1 (VSA-PRIOR-ENTRY-CHANGED b7c66) before; exit 0 `VSA-HISTORY-APPEND-ONLY-RECORDED-RESTORATION` checked 28 after
  (in k143 and, with both diffs committed, in k143-check). New test: evaluateCaseListExtension in the registered append-history test suite, 18/18. Not RED-first (new function); the check run is the red/green evidence.
- Operator: apply protected diff, commit recovery JSON entry (unprotected diff) BEFORE running the check (it requires HEAD:recovery == worktree). Future sitting rule: use the augmentations file for case-ID growth.

## V4 wrapper
- scripts/full-verify.mjs (from scratch/fv-run.mjs): `node scripts/full-verify.mjs <clone> [label] [--reuse]`; candidate mode, --no-reuse default, private HOME with identity +
  init.defaultBranch=main, TMPDIR `<home>/.fv/<label>/t` (refused above 29 chars), realpath of node + its dir first in PATH (fnm shim effect), output scratch/<label>-output.txt,
  summary of exit, duration and red step names from evidence/verify-latest.json. Header per scripts/ convention; listed in docs/operating-tools.md.
- Pure parts pinned in registered run-parallel-tests (6/6). The wrapper itself was NOT run end to end (a Full Verify is hours); only its pure parts are tested.
- Checks in k143-check: check-doc-contracts exit 0. architecture-boundary-check exit 1 with unowned-path findings; the extra one for scripts/full-verify.mjs is accepted per row 45;
  I did not count the total (expected 23 = 22 baseline + 1); no other finding type seen in the tail.

Status: implementation complete in clone; independent Critic read, operator commit of protected parts and PO acceptance pending.
