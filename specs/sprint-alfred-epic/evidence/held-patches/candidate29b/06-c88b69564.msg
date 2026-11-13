fix(antigravity-guard): the read-only run timeline over the brain transcript is no brain write

Antigravity greenfield run 3 (R4): `node <plugin>/scripts/usage-ledger.mjs
--timeline <brain>/.system_generated/logs/transcript.jsonl --json` was
refused AGY-NATIVE-BRAIN-WRITE because the command names a host-owned
path and is not one of the plain read verbs. The timeline only prints to
stdout. Exactly `node <...>/scripts/usage-ledger.mjs --timeline <file>
[--json]` with no shell operator is now treated as a read; a redirect, a
chained command, another script or another usage-ledger mode stays
refused, and file writes under the brain and config directories stay
refused as before.

Checkpoint-Intent: candidate 29, AGY run 3 R4
AI-Assisted: true
Dispatch: stage-0 (elephant)
