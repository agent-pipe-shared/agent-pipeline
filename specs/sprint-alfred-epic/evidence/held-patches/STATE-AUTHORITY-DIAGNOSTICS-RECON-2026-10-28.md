# State authority route: an untyped failure hides its cause, and a slow run cannot be measured (recon, 2026-10-28)

## Report (consumer on native Windows)

`pipeline-state.mjs reopen-design --by <name>` ended three times after 5 to 10 minutes with `SDC-AUTHORITY-UNAVAILABLE` and no reason; a fourth run
ended with `SDC-AUTHORITY-UNAVAILABLE: domain-repository-drift`; an earlier help call ended with `SDC-LOCK-HELD: registry-lock-held`. `session-authority-repair.mjs
inspect` was healthy (no lock, no catalogue drift, twelve producers ok). The command takes more than three minutes in a plain terminal.

## Verified in source

1. `reopen-design` is an entry of `STATE_AUTHORITY_ENTRIES` (`pipeline-state.mjs`), so even `--dry-run` runs inside `withSessionAuthorityBoundary` (registry lock,
   catalogue heal, custody scope) and only the write step is skipped.
2. The refusal handler in `run()` (catch block) prints `(${error?.code ?? "SDC-AUTHORITY-UNAVAILABLE"}${reasonText})`. `reasonText` exists only when `error.reason` is a
   string. Every typed authority error sets it. An error without it (any plain exception, for example a failed native Windows call or an I/O error) therefore prints
   as `SDC-AUTHORITY-UNAVAILABLE` with the cause dropped: the default code masks a different failure. This is the observed output of the first three runs.
3. `domain-repository-drift` comes from `actualAuthorityRepository` (`session-authority-domain-owner.mjs`). It compares the repository captured at boundary entry
   with a fresh `inspectSignedDescriptorCustodyRepository`, whose `candidate` is the HEAD commit and tree read from git on EVERY inspection (`custodyCandidate`).
   So the run saw HEAD move while it was still running. A multi-minute run widens that window; the drift is a consequence of the slowness, not its cause.
4. Every native DACL observation on Windows spawns a fixed PowerShell (`windows-private-state.mjs`, timeout 7 s, batch 10 s). Its memo lives per process, so each CLI run
   starts cold. Every custody inspection spawns `git rev-parse`. Both counts are unmeasured.

## Not verified (hypotheses)

The slowness comes from the number of process starts (git and PowerShell) on a host with real-time scanning, or from a native call that runs into its timeout. Nothing
measures this today, and the handler cannot name the failing call.

## This slice (diagnostics only, no behaviour change)

- The refusal handler names the real failure for an error without a string `reason`: `(<code>: untyped <ErrorName>: <message, at most 240 characters>; at <up to two stack
  frames as function and file name only>)`. A typed error prints exactly as before (existing pins in `session-authority-repair.test.mjs` and `pipeline-state.test.mjs`).
- The refusal ends with ` Elapsed: <n> ms.` after the existing `Repair:` sentence.
- Opt-in `PIPELINE_AUTHORITY_TRACE=1` prints one JSON line to stderr when the command ends (success or refusal): counts and cumulative milliseconds of custody inspections
  (git reads) and of native Windows observations (PowerShell starts), plus total elapsed. Off by default, no output and no cost when unset.

## Out of scope (next slice, after the consumer's measurement)

Reducing the number of process starts (memoize the HEAD read per boundary entry, batch the PowerShell observations) and the HEAD-move window. Not done blind.
