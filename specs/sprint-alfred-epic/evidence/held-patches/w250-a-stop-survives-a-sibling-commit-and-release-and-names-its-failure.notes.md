# w250: a stop survives a sibling's commit and release, and names its failure

Elephant-built (2026-11-06, PO: "Baue alle fixes für einen stabilen Kandidaten ein"), on a slice clone of 6e9e63aa3 (19k applied and stamped).

## Found

- **Windows 19k pair A (gf-probe-47/48, background launches).** The stop of 48 started 6 s after 47's host commit, while stop 47 was still running.
  - Its read scope gave no answer, so it fell back to the exclusive boundary.
  - The registry refused `SDC-ROOT repository-binding-changed` there: the repository the attempt had inspected no longer matched once the sibling's commit had moved HEAD.
  - `retryWhileSessionAuthorityLockHeld` retries only `SDC-LOCK-HELD` and `state-push-owner-unavailable`, so the stop ended at 2.0 s with exit 0 (`NGHF-PENDING-UNAVAILABLE`), left no commit, and wrote a stop-failure record. Recovered as 2e06d8e.
- **Nothing showed that record.**
  - With background launches the only PostToolUse comes before the stop.
  - The SubagentStop hook returned `not-applicable` and wrote its text, if any, to stderr, which an exit-0 hook never shows.
  - The w247 surfacing only works on the PostToolUse path.
- **The release stage of a simultaneous pair still failed intermittently.**
  - Seen on the Linux suites as NGSP7 (`native-managed-unknown-native-entry`) and NGSP9D (both stops `NGHF-AUTHORITY-TERMINAL-RELEASE-EXCEPTION`, `domain-membership-race` and `reference-preimage-changed`), each after both host commits had landed.
  - The w246 re-read repeats the call against the same boundary, whose snapshot the sibling's release had left stale.

## What it changes (protected files)

- **`lib/native-goldfish-host-state.mjs`:**
  - `retryWhileSessionAuthorityLockHeld` gets an opt-in `retryBindingChange`. When set, it also retries `SDC-ROOT repository-binding-changed`, but only while the boundary has not been entered. The stop's pending read (`readNativeGoldfishPending`) opts in. Every attempt inspects the repository afresh, so the retry binds the moved HEAD. Other callers and other `SDC-ROOT` reasons are unchanged.
  - New `nativeBoundaryRounds` and `NATIVE_TERMINAL_SIBLING_RACES` (`domain-membership-race`, `domain-native-membership-race`, `native-authority-member-drift`, `reference-preimage-changed`, `native-managed-unknown-native-entry`).
  - `completeNativeGoldfishAuthority` now repeats its whole terminal write boundary on a fresh boundary, at most 8 rounds with a growing pause, re-scanning between rounds. Within one process the terminal file is written once and the member is advanced once, and the advanced reference is kept. Any other refusal, and the last race, are raised unchanged.
- **`lib/native-goldfish-host-finalizer.mjs`:** a marked stop whose pending state could not be resolved now also returns `unresolvedStop: { dispatchId }`. It still returns `not-applicable`, so the stop stays non-blocking.
- **`hooks/native-goldfish-host.mjs`:**
  - For such a stop, the hook reads that dispatch's own stop-failure record and names it with code, reason and the recover command.
  - The notice goes out as the common `systemMessage` field (never `decision`) as well as on stderr.
  - Every other stop keeps its empty stdout, which the checkpoint contract reads as "allowed".

## Tests (QG-04, extension only)

- `native-goldfish-host-state-fanout.test.mjs` NGFO01:
  - The binding-change retry works only with the opt-in, only before the boundary is entered, within budget, and for no other `SDC-ROOT` reason.
  - Each race is repeated with a refresh between rounds; the rounds are bounded; any other refusal is raised at once.
- `native-goldfish-host-finalizer.test.mjs`:
  - NGHF29: both unresolved marked stops carry their dispatch, and the message names the dispatch and the recover command with no host path.
  - NGHF30: an unmarked or non-Goldfish stop carries none.

## Checks (slice clone)

- Fanout 8/8 and w247 guidance; finalizer 50/50; host-state 79/79.
- Stop-read-scope, finalizer regression and the background pin: 28/28. Commit execution and guard-dispatch: 90/90.
- Stop-pair alone 13/13; one earlier full-file run hit NGSP9D at release before the round fix (W251 part), on the clone without it.
- Stop-pair together with host-state, the load under which NGSP7 and NGSP9D flaked: 3/3 green with the round fix.
- `harness/scripts/check-verify-case-completion.test.mjs` (QG-04, restated in place): the fanout pin goes from 52 to 67, the count the unchanged classifier measures now; 32/32.
- Registration 1183, 0 unregistered; case-completion valid, 392 entries.
- `git apply --check` against the repository: exit 0.

## Not proven

- Not yet seen on Windows: a real background pair whose second stop starts during the first one's commit and lands, and a SubagentStop `systemMessage` actually shown to the operator.
- No Full Verify.
