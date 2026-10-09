# Permanent capture-header regression proposal

The complete canonical postimage is `postimage/plugins/pipeline-core/lib/critic-capture-header.test.mjs`, SHA-256 `119ffef99fbc950f5002066cd293b7cafe9fcd0259ef96fb7d4414733ff852c4`. It is intended for `plugins/pipeline-core/lib/critic-capture-header.test.mjs`; no production source was edited. `registration-metadata.json` is a proposal only. It uses the existing policy schema `pipeline.verify-case-completion-policy.v1`, ascending `caseIds` CDH001–CDH008, and maxBytes 8192. Its requested `path` field identifies the intended file; an eventual registry entry uses that registry's `file` field.

All eight independently authored original assertion bodies are retained. Adaptations are relative canonical plugin imports, a portable `fileURLToPath(import.meta.url)` CLI location, explicit stable IDs, current `registerTestCaseCompletion({ cases, fd: 3, maxBytes: 8192 })`, and disposable fixtures beneath the repository Scratch directory with per-case and suite cleanup. The permanent file imports neither an ignored Scratch source nor a hardcoded host path. Original RED/CONTROL prefixes were removed from display names; CDH005's name says selection integrity, because there is no signature protocol.

| ID | Preserved responsibility | Baseline | Exact fixed overlay |
| --- | --- | --- | --- |
| CDH001 | Actual failed identity-bearing capture admitted | fail | pass |
| CDH002 | Real producer returns honest failed diagnostic | fail | pass |
| CDH003 | Digest/label/exit/candidate/tree/spec/guardrail/envelope controls | pass | pass |
| CDH004 | Malformed/wrong/extra/duplicate identity headers and missing stderr | pass | pass |
| CDH005 | Selection closed shape/digest and diagnostic-only boundaries | pass | pass |
| CDH006 | Absent execution, dirty candidate and existing-output preservation | pass | pass |
| CDH007 | Real CLI emits output; repeated invocation preserves both artifacts | fail | pass |
| CDH008 | Preexisting CLI JSON refuses log creation and preserves output | pass | pass |

Host-authorized execution of `node scratch/alfred-critic-header-permanent-regression-r1-20261009/run.mjs` passed its validation assertions. Each graph ran direct Node with `--test-reporter=tap plugins/pipeline-core/lib/critic-capture-header.test.mjs`, an explicitly inherited descriptor 3, and `PIPELINE_VERIFY_CASE_COMPLETION_FD=3`. Baseline exited 1 with 5 pass/3 fail; exact reader overlay exited 0 with 8 pass/0 fail. The overlay reader's pinned SHA-256 is `19c1e02142ebd9d19f282ec5c426393b7557f1815a7c0964263597990289631f`. Every other dependency is copied unchanged from the pinned repository sources. The real recorder's SHA-256 is `616f1fc97316e740f569c948d27cd4550fa68de8122e979a7437325624691b55`.

Both completion captures contain exactly one DECLARED, eight ordered DISPOSED events, and one TERMINAL covering all IDs; each is 1545 bytes. Their dispositions agree with all eight TAP results. Both graph Scratch directories are empty after execution. Source dependency hashes, registry hash, index hash, candidate and Git status were observed equal before/after. Index SHA-256 was `110af471df3f5d998941f819f22ea96286383812a8aa95bf2cf4256af094ad5f`; Git status was empty. Full hashes, ordered case results, captures, command arguments, and before/after observations are in `run-summary.json`.

| Exact capture | SHA-256 |
| --- | --- |
| baseline-host/tap | `394d7aa08675d20a71fbb9873959c31e35bffac0bf641591dfe13a0f3310d333` |
| baseline-host/fd3.jsonl | `61d8c3736e3c3dace7712e78f59547b596bddf418e1c1d3f749be9ad516b598e` |
| fixed-host/tap | `7e1d8c863ad8bc7d5599a44ccf7702469de5e79e5a09e43a685ccbd9a5229556` |
| fixed-host/fd3.jsonl | `c5fc119e0a0162c37afa6ac8d0a4a54eca6d726ac27cc18f5e6e563099e758ee` |
| Both host stderr.log files (empty) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The first workspace-sandbox attempt is preserved in `baseline/`: it returned 1 pass/7 fail with empty output streams. `debug.mjs` demonstrated nested Node spawn EPERM at that boundary. Those counts are setup failures and do not establish baseline regression behavior. A separate host-bound run supplied the meaningful results above; no captures were overwritten. The initial composed read command was rejected by the closed shell grammar and retried via its exact separate read actions. Host execution was admitted by automatic approval review; no approval rejection remains.

Bootstrap evidence: entry/maps/scoped authorities and role/Scratch references loaded; installed preflight ready with ruleset `b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d`, matching briefing. Goldfish validated but did not execute the onboarding action. Observation governance passed. Architecture orientation was decision-recorded/deferred with physical map present-unvalidated. Calibration is `.claude/pipeline.json` for project agent-pipeline, manifest profile full-sdlc, configured Verify `node harness/scripts/verify.mjs`; duty/model route is briefing-carried, not independently attested. No history/handover read, full bootstrap-pass claim, native provenance, whole Verify, or acceptance claim is made.

These remain focused isolated observations. Baseline header-negative cases may reject before the repaired grammar is reached; the green overlay exercises their assertions after valid capture admission. The original test, fixed reader, installed cache, registry, source tree and index were not modified. No stage or commit was performed.
