fix(guard): po-approval-gate verify-critical is agent readback, not a cross-repository mutation

Codex greenfield run 3 (C5): `po-approval-gate.mjs verify-critical`
against the PO's external approval directory was refused as
GUARD-CROSS-REPO-MUTATION, and the refusal offered a signature override
for a pure read. verify-critical only reads the prepared request and its
proof (only setup, prepare and approve write). It is now admitted in the
same exact shape as `verify` plus the one `--kind <word>` pair the script
requires; a missing kind, an extra argument, an in-root directory and
prepare-critical still hit the blanket refusal.

Checkpoint-Intent: candidate 29, Codex run 3 C5
AI-Assisted: true
Dispatch: stage-0 (elephant)
