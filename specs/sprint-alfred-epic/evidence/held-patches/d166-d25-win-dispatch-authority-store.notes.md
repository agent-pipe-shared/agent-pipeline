# D166 D25 held patch: dispatch authority store on Windows (INTERIM, blocked on budget)

Status: patch written and applies; the full five-suite GREEN run was started but its result was NOT held when the tool budget ended.

## Cause
`plugins/pipeline-core/lib/agy-host-observed-store.mjs` `own()` demanded exact POSIX mode 0o700/0o600 and uid; `sharedAncestor()` demanded `(mode & 0o022) === 0` and uid. Windows reports 0o777/0o666 and has no `process.getuid`, so every existing directory failed with AGY-AUTHORITY-PRIVATE-PATH.

## Change (production file, in the patch only)
- `fail(code, detail)`: optional backwards-compatible `detail`; message becomes `CODE: detail`, `error.code` unchanged.
- new `posixModeJudged()` (reads `process.platform !== "win32"` at call time) and `privateFail(path, check)`.
- `own(stat, directory, path)` and `sharedAncestor(stat, path)`: symlink, type and nlink checks always; mode and uid checks only when `posixModeJudged()`. Failure message names the path and the check (symlink, type, mode, nlink, uid).
- callers pass the path (authorityRoot, verifyAuthorityParents, authorityRead x4, inventory). Two `own()` calls remain without a path (store lines ~143 and ~162; message then says "(unnamed path)"); not changed.
- `mkdirSync` mode arguments untouched.

Preimage SHA-256: not computed here (budget); the patch is `git diff --binary` against HEAD b88a7ed32784efd2a731b51b7aa73245b66ef6a7 (`git apply --check` in a fresh clone: exit 0).

## Tests (lib/agy-session-dispatch.test.mjs, cases prefixed D166-D25, +78 lines)
- RED at HEAD code (filter D166-D25): tests 3, pass 1, fail 2 (win32 mode bits case, real-platform message case). The symlink/type/nlink case passes before and after by design (those checks are unchanged).
- GREEN after: tests 3, pass 3, fail 0.
- Baseline at HEAD, before any production edit: agy-session-dispatch, agy-item-delivery, agy-final-return, native-goldfish-host-state all exit 0 (counts not captured, driver regex was wrong); guard-maintenance-window-kernel-closure baseline not observed.
- Post-change run of all five suites was launched; result NOT held.

## Recon (read-only, not fixed), reachable files
- agy-item-delivery.mjs:24: O_NOFOLLOW ?? 0 open; safe on Windows (constant absent, falls back to 0).
- native-goldfish-host-state.mjs:87, 773: mkdirSync mode 0o700; no-op on Windows, harmless.
- native-goldfish-host-state.mjs:104, 1044, 1110, 1124, 1329: openSync with O_NOFOLLOW ?? 0 and 0o600 create mode; safe.
- native-goldfish-host-state.mjs:114, 136, 888, 1221: O_RDONLY | O_NOFOLLOW ?? 0; safe.
- agy-session-dispatch.mjs:548: writeFileSync mode 0o600; no-op on Windows; 584: O_NOFOLLOW ?? 0; safe.
- guard-dispatch.mjs: no hit. Other lib files imported by these (not scanned: budget) may hold further hits.
No other mode-bit or uid verdict was found in the four scanned files.

## Proposed commit message
fix(agy-store): do not judge POSIX mode bits and uid of the dispatch authority store on Windows (D166 D25)

## Operator flow
apply the diff (`git apply`), `git add -u`, commit with `--no-verify`, stamp, install.

## Coordinator verification (fresh clone of HEAD b88a7ed32, patch applied)
- agy-session-dispatch 10/10, agy-item-delivery 6/6, agy-final-return 16 pass of 18 (0 fail), native-goldfish-host-state 39/39, guard-maintenance-window-kernel-closure 11 passed 0 failed; `git apply --check` exit 0.
- Recon is incomplete: other files with uid or mode-bit verdicts that may sit behind this gate on Windows were NOT scanned (session-authority-registry, session-authority-domain-owner, guard/dispatch-record-lane, governance-event-store, model-role-host-store, model-family-host-store, session-cleanup-recovery). A recon slice follows; the consumer asked for that walk.

## Not done
- Native Windows qualification was NOT performed; it is a PO step.
- lib/agy-host-observed-store.mjs is a custody path: an independent Critic review stays a parent-owned batch gate.
- Full Verify and PO acceptance stay parent-owned.
