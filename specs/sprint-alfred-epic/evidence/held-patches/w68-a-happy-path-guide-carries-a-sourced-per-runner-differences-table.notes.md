# w68 — the happy-path guide carries a sourced per-runner differences table (candidate 17)

Applies after w65 (it edits the file w65 adds). Docs only.

## What and why

The handover asked for a machine-readable runner-capability table in the session-start readback. Building that into the preflight needs measured Codex and Antigravity facts and fits badly into the bootstrap
payload budget, so it is not built. This patch gives agents the part that can be sourced today as a table in the happy-path guide: dispatch carrier, mechanic/deep availability, tool budget, dispatch-record model
label, own-session descriptor at close, close entry, telemetry row and the push second gate, per runner. Each row restates a fact that another held patch or shipped document already states (w52, w53, w54, w60,
w63, the registry file); a cell without such a source says "not measured" or points at the owning reference. The guide ends the table with "a row that is missing has no source: ask the PO".

## Not changed / not proven

- Not machine-readable and not part of the ready preflight readback; this stays an open item with the reason above.
- Cells were taken from the held patches and shipped documents, not from a run on Codex or Antigravity. The Codex mechanic/deep cell deliberately points at the registry instead of stating a value.
- The pin test for the guide (existing scripts, gap markers, no host path) passes with the table; 86 tests across the pin, start-skill and doc-contract suites.
