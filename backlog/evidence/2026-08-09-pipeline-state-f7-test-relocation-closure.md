# Closure evidence: F7 `documentLanguage`-fallback test relocated into the enforced suite

- **Item:** `2026-08-09-pipeline-state-scripts-test-file-never-runs-in-full-verify.md`
- **Maintenance window:** `guard-maintenance-window.mjs` TP-5 lift, prepared and
  installed against candidate commit `4292ff54f7a7b5c25c4518cb88a4fe505c2b883f`
  (intent SHA256 `3c949f169fe66ba8baa64958bba475ca410ba3f5067ced9da54c2948dbc51da9`),
  signed by the PO via `po-human-approval.mjs sign-intent` (signer `humanName`
  `APS-PO`). A first prepared/signed request against the prior HEAD
  (`17db0b4f...`) went stale when unrelated commits (GF-076) landed
  concurrently during the signing ceremony — a correct fail-closed rejection
  by the window's exact-candidate binding, not a defect; re-prepared and
  re-signed against the new HEAD before install. Closed immediately after the
  fix commit via `guard-maintenance-window.mjs close` → `{"status":"closed"}`.
- **Dispatch:** GF-077 (goldfish-deep, claude-sonnet-5/xhigh — test-suite
  authorship in a guard-protected canonical file), dispatched directly in the
  main checkout (no worktree isolation — the maintenance window is bound to
  this checkout's exact tree state).
- **Fix commit:** `c0d23d90e4ab79d6dd1fcd081adbd81bc45aa5d4` — moves the F7
  regression test (as `PS55j`) from `plugins/pipeline-core/scripts/pipeline-state.test.mjs`
  (never executed by Full Verify) into `harness/scripts/pipeline-state.test.mjs`
  (the canonical, TP-5-protected suite `verify.mjs`'s `pipeline-state-tests`
  entry actually runs), adapted to that file's `freshDir`/`captureConsole`
  fixture conventions; drops the now-unused `statePath`/`SCHEMA_ID` import
  from the CB-1a file.
- **Independent verification (Elephant, this session, not just GF-077's own
  report):**
  - `git show c0d23d90 --stat` and full diff reviewed directly: touches
    exactly the two files the briefing authorized, no drive-by edits;
    `harness/scripts/verify.mjs` (TP-3) untouched as required.
  - `node harness/scripts/pipeline-state.test.mjs` re-run independently:
    314/314 cases passed, `PS55j` present and passing, zero `FAIL` lines.
  - `node plugins/pipeline-core/scripts/pipeline-state.test.mjs` re-run
    independently: "all checks passed" — F7 no longer present there, no other
    content in the file disturbed.
  - Full Verify re-run independently: `node harness/scripts/verify.mjs` exit
    0; `evidence/verify-latest.json` shows 267/267 suites at `exitCode: 0`,
    `candidate.binding: "exact"`, clean-to-clean at commit `c0d23d90`,
    including `pipeline-state-tests` — the suite that now executes `PS55j`.
- **Scope decision:** direction (a) (registering the CB-1a file itself as a
  new `verify.mjs` suite, requiring TP-3) was explicitly offered to and
  declined by the PO for this session — see the item's Triage section. Not
  reopened by this closure.
