fix(usage-ledger): --timeline reads the Antigravity brain transcript

Antigravity greenfield run 3 (R3): `usage-ledger.mjs --timeline` knew
only `turn.started`/`turn.completed` for Antigravity and refused the real
brain transcript with timeline-format-unknown. Measured on that run, the
transcript records the human input as USER_INPUT (source USER_EXPLICIT),
each model step as PLANNER_RESPONSE with input_tokens, cache_read_tokens
and output_tokens, and each tool result as GENERIC (content, and error
when it failed), all with created_at. The timeline now reads that family:
human turns, waits, net time, per-step tokens and hook refusals are
measured instead of n/a. The older turn.* form keeps its n/a rule.
transcript-forensics.md no longer claims Antigravity carries no human
message or tool result.

Checkpoint-Intent: candidate 29, AGY run 3 R3
AI-Assisted: true
Dispatch: stage-0 (elephant)
