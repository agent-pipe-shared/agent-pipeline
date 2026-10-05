# UNK6 - reruns of the six "unknown" Verify rows (INTERIM, budget checkpoint)

Environment: disposable native-Linux (WSL) clone of candidate commit 36237bf73, single-file `node --test` runs
(tap reporter), one run per file. Native Windows and macOS untested. Runner columns n/a.
Status: rows 1, 2 settled; rows 3, 5, 6 rerun but only first-level evidence (not root-caused); row 4 NOT settled.

## 1. harness/scripts/check-doc-contracts.test.mjs (doc-contract-tests)
- Command: `node --test --test-reporter=tap harness/scripts/check-doc-contracts.test.mjs`; result 73 pass / 3 fail.
- Failing cases: #41 "stateful design checklist is complete on both required documentation surfaces",
  #54 "current repository integration passes and excludes the instruction path",
  #72 "successful CLI output exposes the immutable snapshot exclusion count".
- Decisive line (all three, and the CLI itself: `node harness/scripts/check-doc-contracts.mjs` -> "Documentation contracts failed: 93 finding(s)"):
  `specs/sprint-alfred-epic/design/working-notes-2026-10/model-family-upgrade-proposal--codex-chain-inventory.md:100 -> ../../../plugins/pipeline-core/lib/model-role-session.test.mjs: target is not tracked`
  plus `external-repair-proposal--REPORT.md:5 -> external-repair.mjs: target is not tracked`.
- All 93 findings are in the committed `working-notes-2026-10/` directory. The relative links use `../../../` but the
  file sits four levels below the repo root, so they resolve under `specs/` (target exists and is tracked at the
  correct path in the clone). Not a fresh-clone artefact; should reproduce in the real checkout.
- Verdict: **real-defect** (broken links in committed docs). Not one of the bootstrap/PO-profile/hook families.
- Fix touches: the two working-notes `.md` files (and `external-repair.mjs` link) under that directory, or a
  checker exclusion for that directory. Protected: no.
- Fix suggestion: change the `../../../plugins/...` links to `../../../../plugins/...` and drop/repair the
  `external-repair.mjs` link; one commit clears all three tests.

## 2. guard-lifecycle-ready.test.mjs, NVA-INTAKEARGV-1
- Command: `node --test --test-reporter=tap --test-name-pattern="NVA-INTAKEARGV-1" plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`;
  1 pass / 1 fail (the pattern matches two cases; the "agent-facing command hint" case passes).
- Failing case: "NVA-INTAKEARGV-1: the one-of text routes admit exactly one alternative, and every mandatory flag is load-bearing" (test line 8618).
- Decisive line: `TypeError: intake-capture-apply requires exactly one of --text, --text-file, --text-turn-ref`
  thrown at `onboarding-argv-shapes.mjs:138` via the test call at line 8649.
- Cause: `MUTATING_ONBOARDING_ARGV_SHAPES` gained a third one-of alternative `--text-turn-ref`; the test's `values`
  table (line 8628) has no `--text-turn-ref`, so when the loop keeps only that alternative zero are supplied.
- Verdict: **stale** (test lags the shape table; deterministic, not fresh-clone specific).
- Fix touches: `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (add a `--text-turn-ref` value to
  `values`; the lines after 8656 that use `oneOf[1]` may need review for a 3-way group). Protected: no (not in TP-1..13).
- Fix suggestion: add `"--text-turn-ref": "<turn-ref literal>"` to `values` and check the both/neither assertions generalise to three alternatives.

## 3. guard-lifecycle-recovery-contract.test.mjs
- Command: `node --test --test-reporter=tap <file>`; 2 pass / 1 fail.
- Failing case: "every offered PO-authority-rebind-planner nextAction is admitted by the real guard".
- Decisive line: not extracted (budget); case name indicates the PO-profile-authority family.
- Verdict (provisional, unconfirmed): **env-fresh-clone**, PO-profile-authority family (likely the clone lacks the
  PO profile receipt). Fix file/protection: not determined.

## 4. verify-journal.test.mjs, ALFRED-RF1
- NOT SETTLED. The name-pattern run `--test-name-pattern="ALFRED-RF1"` printed no tap summary/not-ok lines within
  the filter used (no match or no output); not re-attempted (tool budget). Re-dispatch with the case name read from the file first.

## 5. plugins/pipeline-core/lib/project-onboarding-v3.test.mjs
- Command: `node --test --test-reporter=tap <file>`; 0 pass / 1 fail.
- Failing case: file-level "not ok 1 - plugins/pipeline-core/lib/project-onboarding-v3.test.mjs", `error: 'test failed'`
  (the file itself exits non-zero; no per-case names; probably child-process / fixture crash).
- Verdict (provisional): **unknown**, not root-caused. Likely a bootstrap-binding / hook-provisioning family member,
  unconfirmed. Fix file/protection: not determined.

## 6. plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs
- Command: `node --test --test-reporter=tap <file>`; 62 pass / 1 fail.
- Failing case: #37 "unbound recovery refuses multiple or replaced active descriptors".
- Decisive line: `Cannot read properties of undefined (reading 'candidates')` (TypeError in the test body).
- Verdict (provisional): **env-fresh-clone** (bootstrap-binding / unbound-session family: the result object lacks
  `candidates` when no session identity is bound) - not confirmed against source. Fix file/protection: not determined.

## Open items
- Rows 3, 5, 6: need root cause read (budget stopped at the 35-call checkpoint).
- Row 4: rerun with the correct case name.
