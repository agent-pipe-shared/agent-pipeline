# w62 — the closed-local cleanup refusal and the origin-unavailable refusal name their repair (candidate 17)

Applies on the nine-patch chain; independent of w56–w61 (touches `close-coordinator.mjs`, `session-critic-finalizer.mjs` and their tests; w59 edits other hunks of the finalizer, so apply w59 first
in the script order, which it is).

## What went wrong

The greenfield runs hit two refusals that carried a code and no repair:

- `CLOSE-CLEANUP` ("a clean terminal/release transition requires confirmed cleanup"): the agent was not told what status the lifecycle had, which verb writes the receipt, or that remaining session
  descriptors keep the receipt `uncertain`.
- `SCF-ORIGINAL-SOURCE-UNAVAILABLE`: no message at all. The only admitted way forward today (no runner issues a Source return record) is the sixth `finalize` argument
  `--allow-caller-authored-fallback`, which the agent found by reading the finalizer source.

## Change

- `CLOSE-CLEANUP` now says the observed cleanup status, names `close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>`, and names `session-cleanup.mjs status` for the remaining sessions.
- `SCF-ORIGINAL-SOURCE-UNAVAILABLE` (the user-reachable throw) now says no runner issues a Source return record yet and names the labelled, weaker caller-authored opt-in.
- Tests: the existing uncertain-terminal case and the Cut A origin case assert the new text. 137 tests pass in the two touched suites.

## Not changed / not proven

- Nothing newly accepted: the opt-in already existed and still records `caller-authored-fallback` independence; the cleanup rule is unchanged.
- The text assertions were not mutation-checked separately.
- The other two texts of the same family (`native-goldfish-host.mjs` host-commit hints, `critic-packet-preflight.mjs` producer hint) already name their repair in the current source and were left as they are.
- Budget-grant refusal text and the submit-plan/set-phase profile-drift wording remain open for a later slice.
