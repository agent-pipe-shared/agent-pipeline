fix(close): say an empty or unreadable v2 security plan as open, never as passed

Codex greenfield run 3 (C3): governance read green while the v2
security capability plan was empty and reporting only (the exit was
decided by v1). PO tile 2026-11-13: only honest display now; per-stack
globals detection is a follow-up.

- describeCloseSecurityScope: an unreadable scope is said in the close
  message ("unavailable ...; no security control is shown as passed")
  instead of being left out; an empty capability plan adds that no
  capability control counts as passed and it stays open.
- close quality readback: the security row's evidence carries the v2
  scope note (plan empty, unavailable, or reporting only) beside the
  scanner states.
- Tests in finish-feature (R8 case extended) and close-quality-readback
  (C29-C3).

Checkpoint-Intent: candidate 29c, Codex run 3 C3
AI-Assisted: true
Dispatch: stage-0 (elephant)
