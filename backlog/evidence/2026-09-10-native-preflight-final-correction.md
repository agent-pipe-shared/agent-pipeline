# Native preflight final correction — 2026-09-10

After the second independent Critic round, `RpcProcess.request()` now rejects
immediately when a sticky failure exists, before it allocates an ID, timer, or
writes stdin. It repeats that check inside the promise executor for re-entrant
delivery. `finish()` preserves the first failure while still rejecting and
clearing any pending entries on every later call.

The regression delivers an initialize response and a forbidden server request
in the same output batch. The next thread request is rejected through the
structured unavailable path; no smoke receipt can pass and the fake child is
bounded. This is fixture evidence only. No Verify, live preflight, or model
execution was run for this correction.
