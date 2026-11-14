feat(close): count a stored verify replacement as its own proof kind

ADR-0100 amends ADR-0096 Decision 3 and ADR-0097 Decision 4.
- gate-definition-changes: a configure-verify record with a
  replacement member counts for GS-10/GS-11 only when the approval of
  that subject is in this device's store, as verify-replacement (no
  label when signed, "chat-attributed, not signed" otherwise); it never
  falls back to the first-configuration kind.
- maintenance-delivery: a green receipt for verify:configured counts
  only under the base commit's calibrated verify command, so a
  replacement never turns a red check green by itself.

AI-Assisted: true
Dispatch: stage-0 (elephant)
