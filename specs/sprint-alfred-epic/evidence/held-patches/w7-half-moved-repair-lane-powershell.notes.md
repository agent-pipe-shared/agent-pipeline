# Held patch notes: half-moved repair lane under PowerShell (Slice B parity)

Status: HELD PATCH, targeted delivery green; not applied to the repository tree. Candidate 57775267c. Guard surface
(kernel path, critical Critic path T1). Independent Critic review, Full Verify, native Windows run and PO acceptance stay
parent-owned pending gates. Patch: `w7-half-moved-repair-lane-powershell.patch` (3 files: `lib/guard/write-scope.mjs`,
`lib/guard/powershell-dialect.mjs`, `hooks/guard-lifecycle-ready.test.mjs`).

## Gate-versus-dialect ordering as VERIFIED (contradicts the recon design)
`lib/guard/evaluate.mjs:358`: `if (toolName === "PowerShell") return withLifts(shellLifts, powerShellScopeVerdict(...))` returns BEFORE the
lifecycle gate (`evaluateAfterGrammarAdmission` in `lifecycle-gate.mjs`) is ever reached. So for PowerShell the gate never runs, a
"marker from the gate" is impossible, and replacing the literal `toolName === "Bash"` in `lifecycle-gate.mjs:241` would be dead code
for PowerShell. Adaptation (inside the permitted files): `powershell-dialect.mjs` itself calls
`(dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({rootDir, intent:"session", runner})` and admits only
when it throws a `ProjectOnboardingReadyError` with `code === "PORG-INVALID-OBSERVATION"` and `intent === "session"`. It is called only
AFTER the argv passed the operand validator. `lifecycle-gate.mjs` is deliberately NOT changed (deviation from the briefed edit; reason above).
cmd.exe: no cmd dialect file or tool name exists in `lib/guard` (only `powershell-dialect.mjs`); not pursued.

## Rule set as implemented
- `write-scope.mjs`: `isHalfMovedRepairCommand` now tokenizes (simpleWords) and delegates to the new exported `isHalfMovedRepairArgv(argv, root, deps, {windows})`
  (argv after `git`: exactly `["mv",A,B]` or `["restore",P]`); the loop body is the unchanged Bash validator (pure refactor, HM-1..HM-6 untouched and green).
  New exported pure `halfMovedWindowsOperandRelative(word, windowsRoot)`: accepts both separators (-> POSIX relative); refuses empty, any of
  `* ? [ ] { } ~ $ backtick ! # & | ; < > " ' @`, whitespace, NUL (tilde covers 8.3 short names); refuses any colon beyond a leading drive-letter prefix
  (alternate data streams); refuses a leading backslash or slash without a drive (UNC, extended-length prefix, rooted); refuses empty, `.`, `..` and
  trailing-dot/space segments; a drive-absolute path is admitted only if its segments case-insensitively start with the Windows root's segments and
  are strictly longer (the remainder keeps its case). Windows root = the project root when `process.platform === "win32"`, else
  `dependencies.halfMovedWindowsRoot` (null on a POSIX host, so drive paths are refused, fail closed).
  The remaining checks (one bound feature directory, lstat leaf not a symlink, realpath equality, a bound authority file stays in its directory) are the shared Bash ones.
- `powershell-dialect.mjs`: before the final fallthrough, admit only if the executable (the whole string, lowercased) is `git` or `git.exe` (a path to git.exe is refused),
  the argv passes `isHalfMovedRepairArgv(..., {windows:true})`, and the session observation is an invalid one. The existing rejection of semicolon, dollar, backtick,
  at-sign, pipe, ampersand, redirects and newlines, and the one-segment/no-operator/no-redirect requirement, are unchanged and run first.
- Move-Item, mv, move, mi, git with options, other subcommands, chaining, env expansion and backtick stay refused (HMPS-4).

## Tests (clone, new ids HMPS-1..HMPS-6 after HM-6)
- RED (unchanged production code, whole file, log `red.guard-lifecycle-ready.test.mjs.log` in the scratch driver dir): tests 414, pass 408, fail 3 = HMPS-1, HMPS-2, HMPS-3 (the admissions).
  HMPS-4/5/6 already pass RED because git is refused today; they are kept as regression pins, not RED drivers.
- GREEN (patched clone, whole file): tests 414, pass 411, fail 0, skipped 3.
- Baseline clone2 (candidate, whole file): tests 408, pass 405, fail 0, skipped 3. Failing-name sets: baseline empty, patched empty (identical; no pre-existing failure).
- Also GREEN in the patched clone: `lib/pins/powershell-bypasses-onboarding-read-boundary.test.mjs` (6 pass, 0 fail; exercises the real PowerShell dialect).
- apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## NOT done
- The codex and antigravity pretool guard test files and any other dedicated PowerShell dialect test file were NOT run (tool budget): open for the batch / Full Verify.
- `lifecycle-gate.mjs` untouched (see ordering). A quoted path containing spaces is not admitted (whitespace refused, fail closed).
- Native-Windows-only proofs stay open: NTFS case and 8.3 behaviour, junction/reparse-point detection (only `lstat().isSymbolicLink()` is used; a junction is not a symlink, so
  realpath equality is the real defence), real git.exe, the actual PowerShell tool payload spelling (`command` vs `CommandLine`) and win32 dequoting of backslash paths by
  `parseGuardCommand` (unquoted backslash spellings worked in HMPS-2 on this POSIX host).
- Pre-existing, unchanged asymmetry: PowerShell never reaches the readiness gate, so the new admission is the only readiness-dependent PowerShell lane.

## Commit message (proposed)
`fix(guard): admit the exact git mv and git restore repair commands under PowerShell`

## Operator flow
Apply the diff (`git apply` of the patch file), `git add -u` limited to `plugins/pipeline-core/lib/guard` and `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`,
commit with `--no-verify` (guard-surface edit, per held-patch practice), stamp, install.

## Classification
Touched files are lib/guard kernel sources and `hooks/guard-lifecycle-ready.test.mjs`; none matches TP-1..TP-13. Edits were made only in a scratch clone.
Guard surface => critical Critic path (T1); the independent Critic review is a parent-owned batch gate.
