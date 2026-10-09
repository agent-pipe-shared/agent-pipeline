# WIN-D3 (2026-10-09): native win32 reds, read-only diagnosis

Candidate `feat/sprint-alfred` at `9d2c4b27f` or later. Method: code reading plus the two existing native captures
(`evidence/TR-S1-T3c-20261009/native.txt`, `evidence/WINPRIV-T-20261009/native.txt`). No case was re-run natively in
this dispatch: the budget checkpoint fired before the single-case runs, so every claim below is **established by code
and capture reading, not by a fresh probe**. Open questions are named per class.

## Class B: signed-GMW pre-commit install (`PB-WINDOWS-ASSURANCE`)

**Classification: product defect** (an unhardened private directory created by the governance event store, then
refused by the hardened-directory contract). Test fixture order merely exposes it.

Evidence chain:

1. The refusal names the segment: `private-state directory Windows assurance is insecure for agent-pipeline: private
   path DACL grants a non-owner principal. The directory already existed and was left untouched.`
   (`WINPRIV-T-20261009/native.txt:87`). The segment is `<git-common-dir>/agent-pipeline`, the first segment below the
   anchor in `applyInstall` (`plugins/pipeline-core/scripts/pre-commit-hook-install.mjs:932`,
   `ensureHardenedPrivateDirectory(commonDir, snapshotState)` with `snapshotState = <commonDir>/agent-pipeline/pre-commit-hook`).
2. `ensureHardenedPrivateDirectory` (`plugins/pipeline-core/lib/hardened-private-directory.mjs:119-133`) only
   **assesses** a segment that already exists (`created === false`, then `assureSegment`, `:60-81`) and refuses an
   insecure one; it hardens only segments it created itself (documented `:9-11`).
3. The step that creates that directory first, unhardened: `bindLocalRepositoryFingerprint`
   (`plugins/pipeline-core/lib/governance-event-store.mjs:147-157`) runs
   `mkdir(<git-common-dir>/agent-pipeline/governance-events, { recursive: true, mode: 0o755 })` (`:155`).
   `LOCAL_REPOSITORY_BINDING_SEGMENTS = ["agent-pipeline","governance-events","repository-binding.json"]` (`:90`).
   A recursive mkdir on native Windows leaves the inherited (foreign-ACE) DACL, exactly the case
   `hardened-private-directory.mjs:5-8` warns about. `mode: 0o755` is a no-op on win32.
4. Why only the three GMW cases: `installSignedWindow` (`pre-commit-hook-install.test.mjs:237-268`) calls
   `prepareGuardMaintenanceWindowRequest` / `installGuardMaintenanceWindow`, and `guard-maintenance-window.mjs:94`
   imports `readLocalRepositoryFingerprint`, so the fingerprint is bound **before** `installHook(dir)` (`:678-679`,
   `:692-693`, `:708-709`). Every passing install case calls `installHook` on a repo where `.git/agent-pipeline` does
   not yet exist, so the installer creates and hardens it itself.
5. Not touched: `scripts/po-human-approval.mjs` carries a foreign uncommitted edit; it is not on this path.

Proposed slice (production, small): in `bindLocalRepositoryFingerprint` replace the recursive `mkdir` (`:155`) with
`ensureHardenedPrivateDirectory(gitCommonDir, directory)` (sync, from `lib/hardened-private-directory.mjs`), so the
`agent-pipeline` and `governance-events` segments are hardened on creation. Check the other recursive mkdirs in the same
file (`:220`, `:263`, `:272`) for the same root-private pattern in the same slice. A RED-first test belongs in a
separate test-only dispatch (QG-04): assert, with an injected `platform: "win32"` and fake `harden`, that the binding
path hardens `agent-pipeline` before the `pre-commit-hook` install.

Open questions: (a) whether `governance-event-store.mjs:155` is the only creator on this path (the segment name and call
order fit, but no native probe printed the DACL of `.git/agent-pipeline` right after `installSignedWindow`); (b) the
fourth red in the same capture, `applyInstall then applyRemoval: removes exactly what was installed`
(`test.mjs:748`, failing at `:779`, capture lines 40 and 136-140), is outside the briefed three and was **not**
diagnosed here.

## Class A: signing ceremony (`GES-LOCKED` x2, `:323` readback)

### A1: `GES-LOCKED` at install (end-to-end and drift cases, `signing-ceremony.test.mjs:221`, `:327`)

**Classification: product defect on win32 (host-specific lock-guard command). CONFIRMED (WIN-D3b-20261009), with one
correction to the mechanism and one additional defect found.**

Confirmation: `evidence/WIN-D3b-20261009/guard-spawn.txt` lines 9-10 spawn the identical argv
(`governance-event-store.mjs:730-731`, HEAD version) against a scratch file: exit **1**, empty stdout, stderr is a
PowerShell **ParserError** ("Unexpected token <guard path> in expression or statement", `FullyQualifiedErrorId :
UnexpectedToken`). So the correction: the trailing argument is not bound to `$args` (hypothesis point 2) and is not
null either; `-Command` appends it to the command text, where it is a parse error and PowerShell exits 1 before
running anything. Control with the path embedded as a literal (lines 11-12): exit 0, stdout `ready\r\n`, no stderr, so
nobody holds a lock and the product code, not contention, raises `GES-LOCKED`. The end-to-end case capture
`evidence/WIN-D3b-20261009/ceremony-e2e.txt` (exit 1) shows `code: 'GES-LOCKED'` at line 41.

**Additional defect (will surface once the path binding is fixed):** the readiness check
(`governance-event-store.mjs:714`, `output.includes("ready\n")`) does not match PowerShell's `ready\r\n` (control
line 11: `storeReadyCheck(includes "ready\n")=false`), because `[Console]::Out.WriteLine` emits CRLF on Windows. The
fixed guard would start, hold the lock, and the store would wait forever. The slice must also change the match to
`/ready\r?\n/` or write the literal `ready\n` (for example `[Console]::Out.Write("ready`n")`).

Original text (hypothesis, kept for traceability):

Evidence:

1. The throw site is `acquireStreamLockGuard` (`plugins/pipeline-core/lib/governance-event-store.mjs:720-722`):
   `GES-LOCKED` is raised whenever the guard child exits **before printing `ready`** with exit code **1**; any other
   code gives `GES-LOCK-RUNTIME`. The code does not distinguish contention from the child failing.
2. On win32 the child is `powershell.exe -NoLogo -NoProfile -NonInteractive -Command <script> <guardPath>`
   (`:726-732`), and the script reads its file from `$args[0]` (`:730`). With `-Command`, PowerShell does **not** bind
   trailing arguments to `$args`; they are appended to the command text. So `$args[0]` is `$null`,
   `[System.IO.File]::Open($null, ...)` throws, and PowerShell exits **1** before `ready`. That reproduces the
   `GES-LOCKED` signature without any process actually holding the lock.
3. This also answers "who holds the lock and why it is not released": on this theory **nobody** does. The release
   path (`release`, `:717`) is only reachable after `ready`, which on this theory never happens on win32.

Proposed slice (production): bind the path without `$args`, for example pass it via an environment variable
(`env: { ...process.env, PIPELINE_LOCK_GUARD: guard }`, read with `[Environment]::GetEnvironmentVariable`) or embed a
single-quote-escaped literal in the script, and surface the child's exit code and stderr in the thrown error so
`GES-LOCKED` regains meaning (`stdio[2]` is currently `"ignore"`, `:705`).

Open question (decisive, one single-case native run): run
`node --test --test-name-pattern "ceremony runs prepare" plugins/pipeline-core/scripts/signing-ceremony.test.mjs`
through `capture-evidence.mjs`, or invoke `nativeStreamLockGuardCommand`'s script by hand, and confirm the PowerShell
exit code and stderr. If the guard starts and prints `ready`, this hypothesis is wrong and the next suspect is a
stale `.lock` owner (`isRecoverableDeadLock`, `:682-690`, which uses `process.kill(pid, 0)`).

### A2: decline case, `1 !== 0` at `signing-ceremony.test.mjs:323`

**Classification: test defect (win32 path spelling), established by code reading.**

Evidence: `:318-322` spawns node on `join(new URL("./guard-maintenance-window.mjs", import.meta.url).pathname)`.
On win32 `URL.pathname` is `/<drive>:/...` (leading slash, forward slashes), not a usable drive path, so the spawned
node cannot load the script and exits 1: the assertion `status.status === 0` receives 1
(`TR-S1-T3c-20261009/native.txt:90`). Only the `guard-maintenance-window.mjs status` readback is affected; it is
independent of A1 (the decline path rejects before install, `:294-313`).

Proposed slice (test-only): `fileURLToPath(new URL("./guard-maintenance-window.mjs", import.meta.url))` instead of
`.pathname`. Check for a sibling `.pathname` use in the same test file in the same slice. A separate test-only dispatch
should make the edit (QG-04).

## Summary

| Class | Case | Classification | Slice |
|---|---|---|---|
| B | three signed-GMW installs | product defect | harden dirs in `bindLocalRepositoryFingerprint` (`governance-event-store.mjs:155`) |
| A1 | two `GES-LOCKED` | product defect (hypothesis) | do not rely on `$args` with `-Command` (`governance-event-store.mjs:730`); confirm with one native run first |
| A2 | `:323` readback | test defect | `fileURLToPath` instead of `.pathname` |
