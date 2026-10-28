# Recon notes: review receipt binding by content hash (Phoenix Wanted 4) and PowerShell parity of the half-moved repair lane

Status: read-only recon, notes only, NO patch, no clone made, no production or test file touched. Candidate c98348dbe.
Paths are repository-relative. Budget-stopped at about 33 tool uses: items marked UNVERIFIED were not read. Several `rg` spellings
(`--no-line-number`, two paths in one call, `-g` plus pipe) were refused by the shell grammar.

## Item A: receipts bound to hash, not path (backlog 2026-10-26-design-course-and-registrar-disagree-on-the-feature-directory, Wanted 4)

### Where receipts are written, stored, compared (lines re-read)
- Write: `plugins/pipeline-core/lib/design-review-receipt.mjs` `createDesignReviewReceipt` (line 322). Path rules `pathsAreAcceptable` (130) are
  called at 181 (parse) and 346 (create) and only check safe form and distinctness, not any link to the current folder. Delta chaining
  requires equal `sources.prd.path` and `sources.spec.path` between round 1 and round 2 (line 360, `DRR-DELTA-CHAIN`) and refuses
  identical sources (361, `DRR-DELTA-UNCHANGED`). Hand-writing a receipt file is refused by `design-review-receipt-write-guard.mjs`
  (so a receipt cannot be rewritten with new paths by hand).
- The receipt ALREADY carries content hashes: `sources.prd.sha256`, `sources.spec.sha256`, `sources.companions[].sha256`, `report.sha256`
  (+ optional `report.originalSha256`), `previousReceiptSha256` (lines 164-188, 338-343, 388). Paths are stored next to them.
- Compare (the failing sites after a byte-identical folder move):
  1. `plugins/pipeline-core/lib/design-consistency-check.mjs:342-348` in `analyzeReviewChain`: for a latest receipt of kind `initial`,
     `canonical(latest.sources) !== canonical(currentSources)` emits `DCC-REVIEW-RECEIPT-BINDING`. `canonical()` includes the paths, so a
     moved folder differs although every hash is equal. THIS is the primary refusal.
  2. `design-consistency-check.mjs:330-338`: a delta chain is broken if `second.sources.prd.path` / `spec.path` differ from the first, or
     `previousReceiptPath !== first.path` (`DCC-REVIEW-DELTA-CHAIN`).
  3. `design-consistency-check.mjs:504-508` (full check path): `stateByPath.get(summary.report.path).sha256` is looked up at the
     receipt's OLD report path; after a move there is no pathStates entry (a pathStates hole is a `DCC-INPUT` caller error, see 272-275 and
     the pin `pinPathStateHole` in `design-consistency-check.test.mjs:962`), so this is not a clean typed refusal either.
  4. `design-consistency-check.mjs:296-303` `unreviewedSourceDelta` (mirror at `design-approval-binding.mjs:173-177`) is keyed by PATH:
     after a move every old path shows `currentSha256: null` and every new path `reviewedSha256: null`, so a round-2 (delta) receipt reports
     a full unreviewed delta for byte-identical files.
  5. `design-approval-binding.mjs:316` (`verifyDesignApprovalRequest`): `canonical(request.binding) !== canonical(recomputed.binding)` is
     `DAB-BINDING-DRIFT`; the binding embeds `sources.*.path` (copySources, 180) and `reviewReceipts[].path` (221), so a signed request
     built before the move is voided by design (this is the PO signature, correct to void unless re-signed).
- Callers: `plugins/pipeline-core/scripts/pipeline-state.mjs:11570-11576` (`present-plan`: `readDesignApprovalInputs` then
  `createDesignApprovalBinding`), `:9608` and `po-human-approval.mjs:393` (`verifyDesignApprovalRequest`), `:14174`. No `rebind` symbol
  exists in `design-review-receipt.mjs`, `design-approval-binding.mjs` or `design-consistency-check.mjs` (rg returned nothing): no
  sanctioned rebind exists today.

### Smallest safe change (design, not built)
Invariant, stated precisely. A review receipt R (kind `initial`, or the latest of a delta chain) is accepted against current sources S
when EITHER canonical equality holds (today), OR a rebind-equality holds: (a) the same roles exist: PRD, Spec, and the same count of
companions; (b) for each role the receipt hash equals the current hash (`prd.sha256`, `spec.sha256`, every companion `sha256`; companions
paired by their path RELATIVE to the old/new feature directory, so the relative layout is identical); (c) the old PRD/Spec/companion paths
share one directory prefix P_old and the current ones share one prefix P_new, with identical relative suffixes; (d) the report file at
the new location (or the receipt's `report.sha256` resolved at the new relative path) has the same `report.sha256`; (e) every current
path still passes `isSafePath` and the registrar topology (`specs/<featureId>/`). Any hash difference, role swap, count change or
layout change still yields `DCC-REVIEW-RECEIPT-BINDING`. The check must be an additional clause beside the canonical comparison, never a
replacement: dropping the path comparison entirely would let a receipt for PRD bytes X attach to a different file holding the same bytes
(a copy outside the feature directory, a PRD/Spec role swap when two files are byte-identical, a companion substituted by a same-bytes
file), would hide a mistaken rebind to a directory the registrar rejects, and would defeat `DRR-DELTA-CHAIN` (`previousReceiptPath`).
The unreviewed-delta computation (site 4) follows the same rule: key `unreviewedSourceDelta` by role plus relative path when rebind-equal.
Open design question (UNVERIFIED, needs PO/Spec call): receipts are immutable canonical files that embed OLD paths, so the binding
(`reviewReceipts[].path`) keeps pointing at wherever the receipt files live; whether the receipt files move with the folder, and whether
the PO signature is re-requested after a rebind (it must be: the binding digest changes), is not decided by code. The rebind should
emit a recorded reason in the binding (e.g. a closed `pathRebind: {fromDir, toDir}` field) instead of silently passing.

### Slices (implementation order)
1. `feat(design-consistency): accept a byte-identical feature-directory rebind in the review-chain comparison`
   Files: `plugins/pipeline-core/lib/design-consistency-check.mjs` (`analyzeReviewChain` clause + path-agnostic `unreviewedSourceDelta`),
   `plugins/pipeline-core/lib/design-consistency-check.test.mjs`. RED cases (fixture style: existing synthetic `createInput`/summary
   objects with `sha()` digests, in-memory `pathStates`, no real git): (i) same hashes, moved dir -> no entry; (ii) moved dir + one
   changed byte in PRD -> `DCC-REVIEW-RECEIPT-BINDING`; (iii) moved dir + changed companion; (iv) PRD/Spec swapped between two
   byte-identical files; (v) moved dir with different relative layout; (vi) report hash changed at the new path; (vii) delta chain moved
   consistently vs moved only one of the two receipts.
2. `feat(design-approval): record the path rebind reason in the approval binding` Files: `design-approval-binding.mjs` + test; closed
   schema key `pathRebind`; RED: binding digest changes, `verifyDesignApprovalRequest` still refuses a pre-move request (`DAB-BINDING-DRIFT`).
3. `test(state): present-plan after a folder rebind passes without a new review round` Files: `pipeline-state.mjs` test only
   if no production change is needed at `:11570`; otherwise a held patch.
Protected/custody: none of these files matches TP-1..TP-13. `design-review-receipt*.mjs`, `design-consistency-check.mjs`,
`design-approval-binding.mjs` are lib kernel sources and `pipeline-state.mjs` is the state machine: held patches applied by the PO as
operator (backlog Notes line 62). `po-gate-authority.mjs` and the Phoenix wrapper are NOT touched by slices 1-2 (Wanted 2 is a separate
slice). Slice 2 changes the signed-binding shape (security-relevant): independent Critic required.
Technically delivered when: slices 1 and 2 landed with pins green, the RED cases (ii)-(vi) green, and the folder-move regression
("byte-identical rebind keeps its receipts") exists as a pin. Verify, batch Critic, native run, PO acceptance remain gates.
Confidence: medium (comparison sites read and cited; consumer file layout and receipt-file movement UNVERIFIED).

## Item B: PowerShell parity of the half-moved repair lane

### State at this candidate (re-verified)
- The Bash lane is APPLIED in the repository, not merely held: `plugins/pipeline-core/lib/guard/write-scope.mjs:124`
  `isHalfMovedRepairCommand`; `plugins/pipeline-core/lib/guard/lifecycle-gate.mjs:238-243` admits it only for
  `PORG-INVALID-OBSERVATION`, intent `session`, and `toolName === "Bash"` (line 241). The held patch/notes
  (`w7-half-moved-repair-lane.patch/.notes.md`) match this shape; the notes' "Bash-only" statement is exactly line 241.
- Rule set from the patch (read): `simpleWords(command, root)` one simple command; `git mv A B` (4 words) or `git restore P` (3 words);
  operands must not start with `-`, contain a backslash, glob or shell metacharacter, whitespace, or a `..` segment; relative to root
  strictly inside ONE bound feature directory (dirname of `activeFeature.planPath/specPath/designInputPath`, at least 2 segments, first
  `specs` or `docs`, no dot or node_modules segment); lstat leaf not symlink; nearest-existing-ancestor realpath equals the lexical
  spelling; a bound authority file may only be renamed within its own directory. The backslash in the metacharacter class is why Windows
  absolute paths are refused today (fail closed).

### Shell entry points
- `SHELL_TOOLS = ["Bash", "PowerShell"]` (`lib/guard/constants.mjs:267`); `evaluate.mjs:165-171` treats `PowerShell` and reads the command
  from `tool_input.command ?? tool_input.CommandLine`. So the PowerShell tool reaches `lifecycle-gate.mjs` with the same input shape; the
  ONLY Bash-specific pieces of the repair lane are the literal `toolName === "Bash"` at `lifecycle-gate.mjs:241` plus the POSIX tokenizer
  `simpleWords`.
- PowerShell command admission otherwise lives in `lib/guard/powershell-dialect.mjs` `powerShellScopeVerdict` (53-103): it rejects
  semicolon, dollar, backtick, at-sign, pipe, ampersand, redirects and newlines, parses with `parseGuardCommand(command, root, {platform: "win32"})`,
  requires exactly 1 segment, 0 operators, 0 redirects, then dispatches by `basename(executable).toLowerCase()` for `new-item`,
  `set-content`, `add-content`, `get-*`, `test-path`, `node`; everything else (including `git`) falls to the final
  `GUARD-POWERSHELL-GRAMMAR` refusal (102). Whether that verdict runs before or after the lifecycle gate is UNVERIFIED. cmd.exe: no
  separate cmd dialect file was found in `lib/guard` (only `powershell-dialect.mjs`); UNVERIFIED whether a cmd tool name exists in any runner.
- Therefore a PowerShell `git mv`/`git restore` probably needs TWO admissions: the readiness lane (`lifecycle-gate.mjs:241`) and the
  dialect verdict (`powershell-dialect.mjs` final fallthrough), else the lane may be admitted by the gate but refused by `powerShellScopeVerdict`.
  The Codex and Antigravity pretool wrappers share the lib code, but their tests were NOT re-run by the original patch either (still open).

### Can a PowerShell form be admitted without widening the grammar?
Yes in principle, if admitted narrowly: the already-parsed `parseGuardCommand` win32 result gives dequoted argv for one segment
(no operators, no redirects, no dollar, backtick or at-sign). Admit only executable basename `git` (or `git.exe`) with argv exactly
`["mv", A, B]` or `["restore", P]`, then run the SAME operand validator as Bash. Path normalization rules needed: (1) accept both
separators and map backslash to slash for the feature-directory test, but still refuse a drive prefix other than the root's, UNC share
paths, the extended-length prefix, and any colon in a segment (alternate data streams); (2) an absolute Windows path is accepted only if,
after `win32.normalize`, it is root-prefixed case-insensitively (NTFS is case-insensitive: compare lower-cased for the prefix test but
preserve case for the physical equality check), and refuse 8.3 short names (tilde-digit) and trailing dot or space segments, which the
Windows filesystem silently strips; (3) native realpath equality as in the Bash physical check; reparse points (junctions, not only
symlinks) must be refused via `lstat` (UNVERIFIED which helper exists); (4) `..` and `.` segments refused after splitting on both
separators; (5) only the literal executable `git`, never `mv`, `move` or `Move-Item` (a PowerShell cmdlet form would be a new grammar
and is out of scope).
Slices (order):
1. `refactor(guard): split the half-moved operand validator from the POSIX tokenizer` Files: `lib/guard/write-scope.mjs` (+ its test
   `hooks/guard-lifecycle-ready.test.mjs`). Pure refactor, existing HM-1..HM-6 stay green (no case weakened).
2. `fix(guard): admit the exact git mv and git restore repair commands under PowerShell (Slice B parity)` Files:
   `lib/guard/lifecycle-gate.mjs:241` (`SHELL_TOOLS.includes(toolName)` with dialect-specific word extraction),
   `lib/guard/powershell-dialect.mjs` (admit `git mv`/`git restore` only when the lifecycle observation is the invalid-session one; the
   gate must pass an explicit marker, otherwise `powerShellScopeVerdict` must not admit git at all), `hooks/guard-lifecycle-ready.test.mjs`.
   RED cases (fixture style: `qw04Run(path, "PowerShell", {CommandLine}, "invalid")` with root fixtures from `hmRoot`; Windows-style
   spellings built with `win32.join` and asserted through the pure operand validator on POSIX CI): PS-1 `git mv specs/f/a.md specs/f/b.md`
   admitted; PS-2 backslash-separated relative spelling admitted; PS-3 a drive-absolute path inside root admitted only when it normalizes
   under root; PS-4 refusals: parent-segment traversal, UNC, another volume, extended-length prefix, alternate data stream, 8.3 short
   name, trailing dot, junction escape, `git mv -f`, `Move-Item`, chained command, `$env:` expansion, backtick; PS-5 session-intent only
   (invalidBootstrapIntent, partial and drift remain refused); PS-6 no readable feature directory admits nothing.
Protected/custody: guard sources (`lib/guard/*`, `hooks/guard-lifecycle-ready.test.mjs`) are control-placement; none matches TP-1..TP-13
(TP-1/2 name `guard-git.test` and `guard-testpath.test`, not this file): held patch applied by the operator; guard surface means the
critical Critic path (T1) applies.
Native-Windows-only proofs (stay an open native gate): NTFS case-insensitivity and 8.3 short-name behavior, junction/reparse-point
detection through `lstat` and native realpath, real `git.exe` behavior on `git mv` (core.longpaths, autocrlf), the actual Claude
PowerShell tool payload spelling (`CommandLine` vs `command`) and quoting as received, and that `parseGuardCommand` win32 dequotes
backslash paths the same way as the CI emulation. These cannot be proven on this Linux/WSL host.
Technically delivered when: slices 1-2 landed, PS-1..PS-6 green with HM-1..HM-6 unchanged, a pin that `Move-Item` and aliases stay
refused, and the native-host gate recorded as open; Verify, batch Critic, native run and PO acceptance remain gates after 75.
Confidence: medium on entry points (gate line 241, `SHELL_TOOLS`, dialect fallthrough read); low on the order of gate vs dialect verdict
and on cmd.exe (UNVERIFIED); medium-low on the Windows normalization list (design from NTFS knowledge, not repo evidence).

## Not run / not reached
No clone, no scratch driver, no RED/GREEN, no baseline-versus-patched comparison of
`plugins/pipeline-core/lib/pins/windows-private-dacl-detail-codes-and-root-only-rule.test.mjs` (briefing says NO patch; that file is
untouched). Phoenix `po-gate-authority.mjs` was not re-read. `readDesignApprovalInputs` and where receipt files live after a move were
not read.
