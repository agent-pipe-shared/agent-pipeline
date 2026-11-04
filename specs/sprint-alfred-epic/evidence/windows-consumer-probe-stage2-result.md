# Windows consumer probe, stage 2: result (installed plugin `0.7.0+claude.20261104062201.95d3e81`)

Source: the native Windows consumer session, 2026-11-04. The consumer's owner approved the stage in that session's own chat; the session stopped at S1 and ran S5.

| Step | Result |
|---|---|
| S0 | original branch `main`; HEAD unchanged; throwaway branch `pipeline-probe/stage2` created |
| S1 plan | `goldfish-host-commit-recover.mjs plan`: `GHCR-NO-SOURCE` (no pending host-commit state), the same `NGHF-PENDING-UNAVAILABLE` stop-failure record as in stage 1 |
| S1 briefing | refused: `DBG-AC-ROW-MISSING`. The generated briefing needs a 3-column acceptance row in the approved Spec that names the item; a probe dispatch has none |
| S2, S3, S4 | not run (no dispatch could be built) |
| S5 | back on `main`, local change in `docs/state.md` kept, throwaway branch deleted, no commit was made on it |

Reading: the live E1 reproduction and the E4 parallel-dispatch check cannot be driven by a synthetic probe in a consumer that has an approved Spec, because the sanctioned briefing route demands an acceptance criterion; binding an unrelated criterion would be a false binding, a hand-written briefing is forbidden, and a Spec change is the owner's decision, not a probe. The measurement therefore has to come from a REAL background dispatch of the consumer's own work. Candidate 19c adds the diagnostic that makes such a dispatch self-explaining (w207: the stop-failure record names why the pending state could not be read; `plan` prints it), so the next real Windows dispatch that fails reports the cause itself.

Not learned: whether the PreToolUse step writes the pending state on Windows (E1), and what a second parallel dispatch does (E4). A guard refusal observed on the way: a glob over the consumer's tests folder was refused with `GUARD-READ-TARGET` even with an explicit path inside the project root (not investigated here).
