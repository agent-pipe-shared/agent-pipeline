# w251: the 19l Full Verify reds and the two minor findings (candidate 19m)

Base: `6c12c7ab5` (19l applied, stamped and recorded). Built by the Elephant in the slice clone `scratch/agent-out/w251` (small fixes,
PO rule of 2026-11-06: a 19m built anyway carries the two minor findings). One held patch, one commit.

## Why

The Full Verify of 19l (clone at `3e1dea1e1`) had 14 red suites. Four were caused by this session's own environment:
`PIPELINE_AUTHORITY_TRACE=1` was set, so the opt-in trace line was printed on stderr, which breaks CLI tests that read the output.
Re-run without it, the remaining 10 had these causes, each fixed here:

| Red suite(s) | Cause | Fix |
|---|---|---|
| doc-contract-check, doc-contract-tests | `[M][R]` in `native-checks-options-2026-11-05.md` is read as a reference link to an undefined label `r` | written `[M] [R]` |
| verify-suite-append-history-check | w249 (commit `d9731d046`) extended the stop-pair row's case list in place AND appended two clauses to its `invariantPinned`; the case-list witness admitted only the case list | the witness also admits an appended invariant (old text an exact prefix of the new), only together with a case-list extension of the same row; one recovery entry bound to `d9731d046`, its parent and both registry digests (fourth rewrite of eight) |
| guard-maintenance-window-kernel-closure-tests, pin kernel-closure-check-masks | `session-authority-registry.mjs` imports `source-digest-memo.mjs` (19i), which was not in `NEVER_LIFTABLE_KERNEL_PATHS` | listed in the kernel set and in the threat-model list (it imports only `node:fs` and `node:path`) |
| product-capability-inventory-tests, pin capability-inventory-checker | two `surfaceIds` pairs out of code-unit order (19j w244 and an earlier insert) | sorted |
| pin windows-requester-ancestors D3 | O5c (w239) moved the platform test of `readRaw` behind the module's `isWin()` seam; the structural pin still named `process.platform==='win32'` | restated in place (QG-04): the pin names `isWin()` and additionally pins that `isWin()` reads `process.platform` unless a test seam is set |
| push-prepare PF-36 | w231 made an untracked foreign file no longer refuse `commit-pipeline-owned`; PF-36 still used an untracked file as the refusing change | restated in place (QG-04): the refusing change is a tracked modification; the test additionally asserts that an untracked foreign file is listed in `untouched` and not committed |
| phoenix-authority-revision-installed-package-tests | `local-worker-supervisor.mjs` resolved `realpathSync(process.execPath)` at import; under Node's permission model with reads limited to the installed package this is denied (red also at the 19h base, so not caused by the 19 chain; it shows since Node lives outside the fixture under the version manager) | resolved on first use instead of at import |

The two minor findings of the 19l Windows run (PO decision 2026-11-06 evening):

- The preflight lock row read "could not be observed" with no lock present, on both machines. Cause: the preflight passed the wide
  `discoverRepository()` result to `inspectSessionAuthorityLock`, which takes exactly `{primaryRoot, commonDir, candidate}` and refused it,
  so the probe always fell to `unknown`. Fix: the probe passes `inspectSignedDescriptorCustodyRepository(primaryRoot)`. New case E2 (C19m
  w251) runs the real probe on a real repository: absent, the row is ready; an unreadable repository still degrades.
- The trace `failures` code was only `exit 1`. The native authority call now records the cause next to the exit status: the helper's own
  closed `WIN-AUTH-*` code from its JSON envelope, else `no-code`, or `no-json` when stdout was not JSON. Still bounded, no path. New case W247-5.

## Elephant decision named here

The appended-invariant rule in `check-verify-suite-append.mjs` is the Elephant's decision under the PO's 2026-11-04 decision on case-list
extensions: coverage only grows (the old pinned text stays byte-exact, new cases come with it), and it is admitted only through an entry
bound to one commit and its bytes, like every rewrite.

## Evidence (clone, without the trace variable)

- The 14 suites red in the 19l Full Verify: all 14 green (rerun-reds `w251a` 12 green before the clone commit; the two that read committed
  state, inventory and append history, green after it).
- Touched suites: win-authority-readiness-and-preflight 17/17, agent-guidance-w247 5/5, check-verify-suite-append tests 22/22,
  local-worker-supervisor, windows-node-authority-reads, win-authority-rest, session-authority-repair and pipeline-start-preflight 190/190.

Not yet: Full Verify of the applied chain, Windows run, Critic review, PO acceptance.
