fix(transcript-export): find Codex segments and children beyond the candidate bound by name and count unknown children

Codex greenfield run 3 (C1): the export enumerates at most 2000 session
files newest-first, so an older segment of the requested session or a
spawned child beyond that bound was left out, and a spawned child with
no session file was not reported at all. PO tile 2026-11-13: full
export of all segments and children; unknown children must be 0.

- Codex names a session file rollout-<time>-<session id>.jsonl. A name
  walk (no file opened, own bound 500000, seam maxNameIndexFiles) adds
  every segment named for the requested session, authenticated like any
  candidate; the snapshot recheck uses the same augmented set.
- Spawned children (a spawn result naming the agent id) are looked up by
  name per path, so an older segment of a listed child is found too.
- A spawned child with no authenticated session file is counted:
  unknownChildren in the export, reason child-segment-not-found, export
  partial. Only the count leaves, never the id.
- candidate-bound-reached is lifted only when the name walk is whole and
  every file beyond the bound names its own session (UUID suffix);
  otherwise an unopened file could still belong to the session.
- Two C29-C1 tests; the key-list assertion gains unknownChildren.

Checkpoint-Intent: candidate 29c, Codex run 3 C1 (export)
AI-Assisted: true
Dispatch: stage-0 (elephant)
