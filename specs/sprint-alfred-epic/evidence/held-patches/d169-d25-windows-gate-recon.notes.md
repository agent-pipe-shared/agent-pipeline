# D169 recon: POSIX mode-bit and uid verdicts behind the Windows dispatch authority store (D25 follow-up)

Read-only recon by the coordinator (rg plus targeted reads at HEAD 08a8b9542). No production file was changed; no patch is held. It closes the "recon is incomplete" line of `d166-d25-win-dispatch-authority-store.notes.md`.

## Scanned and judged

| File | Finding on native Windows |
|---|---|
| `lib/session-cleanup-recovery.mjs` (156-178, 2871) | Mode-bit checks sit in the non-win32 branch; win32 uses the DACL assessors. Safe. |
| `lib/governance-event-store.mjs` (231-233, 278-284, 924-930) | Every mode and uid verdict is guarded by a win32 branch or a `getuid` typeof check. Safe. |
| `lib/model-role-host-store.mjs` (37) | `platform === "win32" \|\| ...`. Safe. |
| `lib/session-authority-registry.mjs` (139, 1082) | `owned()` has a win32 branch (`inspectWindowsOwnedAuthorityPath`); the `getuid` check at 1082 is a typeof guard. Safe. |
| `lib/session-authority-domain-owner.mjs` (58-60, 115, 136) | `owned()`, `chain()`, `observedChain()` and the source read have win32 branches; the socket check at 136 is typeof-guarded and sockets are not read on win32 (134). Safe. |
| `lib/model-family-host-store.mjs` (186, 192, 197) | NOT win32-aware: `(st.mode & 0o077) !== 0` throws `STORE_PERMISSIONS`, `STORE_FILE` or `STORE_RACE` on Windows, where Node reports 0o666 and 0o777. See below. |
| `lib/agy-host-observed-store.mjs` | Fixed by the held D25 patch. |

## Finding A (reachable on the dispatch path): `lib/guard/dispatch-record-lane.mjs` `secureDirectory`

- Lines 281-286: `(stat.mode & 0o022) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())` raises `DRO-PATH`. The `getuid` half is typeof-guarded and harmless on Windows; the `mode & 0o022` half is not guarded. Node on Windows reports 0o777 for a directory, so a Windows directory fails this verdict.
- The sibling file check at line 306 already branches on `process.platform === "win32"` and judges the DACL (`assessWindowsPrivatePath(path, { fresh: true })`), with an explanatory comment at 301. The directory check was left behind: same defect class as D25.
- Callers: lines 97 (`commonDir`, `<commonDir>/agent-pipeline`, the owner dir), 288, 293, 297, 299 (`root`, `evidence`), 374. This is the dispatch record lane, written for every dispatch, so it is a probable next Windows first-dispatch blocker once D25 is applied.
- Not yet observed on a real Windows host; the claim rests on Node's documented Windows mode reporting and on the asymmetry with line 306. The fix slice must prove it with a test that injects a win32 platform and a 0o777 directory stat.
- File is a guard path: change only by held patch, then operator apply and an independent Critic review.

## Finding B (not on the Claude Goldfish path): `model-family-host-store.mjs`

- It serves the model-family (Codex and Antigravity family) routes, not the Claude Goldfish dispatch path that blocked the Toolbox consumer.
- Its Windows behaviour is already pinned as unavailable by `lib/pins/model-role-bootstrap-is-always-unavailable-on-native-windows.test.mjs`; the mode-bit verdicts above are consistent with that pin.
- Decision needed from the PO only if model-family routes must run on native Windows before 0.7.0. Otherwise this stays a known limit and belongs in the Windows section of `onboarding-recovery.md`.

## Not covered

- `lib/guard/` was scanned for `getuid`, `.mode &` and `.uid` (two hits, both in `dispatch-record-lane.mjs`, Finding A). A name-only `rg -l "mode & 0o0[27]"` over `lib/`, `scripts/` and `hooks/` lists about 90 files (tests, fixtures, Codex and Antigravity hosts, pins among them). Those were NOT judged one by one; only the files on the Claude first-dispatch path named above were. A walk of that call chain with a win32-simulating test is the follow-up (see the fix slice for Finding A).
- A static scan cannot prove that a win32 branch behaves correctly on a real Windows host; native Windows qualification of D25, PF-78 and S7b stays a PO step.
- `lib/session-authority-domain-owner.mjs:47` and `lib/session-authority-registry.mjs:73` compare a post-write mode to `0o600`; on win32 the publish path is the native writer, so this was not judged a defect, but only a native run confirms it.
