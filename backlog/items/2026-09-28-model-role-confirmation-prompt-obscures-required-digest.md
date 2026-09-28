---
schema: pipeline.backlog-item.v1
id: pipeline.model-role-confirmation-prompt-obscures-required-digest
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-28
source: "Attended PO model-role bootstrap: noninteractive Codex shell could not confirm; subsequent terminal input Confirm was rejected; exact displayed digest succeeded and installed bootstrap reused all seven receipts."
sprint: alfred
done_when: manual
---

# Make model-role confirmation usable on the first attempt

`model-role-bootstrap.mjs` prints the complete JSON readback and asks
`Confirm the displayed mapping digest:`. A human entering `Confirm`, as in
other Pipeline ceremonies, receives NOT-CONFIRMED. The prompt does not show
the expected value next to the input or explain that a 64-character digest
must be copied. A noninteractive Codex shell returns confirmation-required
without offering a concrete attended route for the current session.

The actual ceremony ultimately succeeded. The installed bootstrap then
returned REUSED with seven receipts and the identical confirmed digest.
This is a usability improvement, not evidence that confirmation was bypassed
or that receipt verification failed.

## Acceptance

- Show the expected input clearly at the prompt and explain rejection without
  burying the next step in a large JSON payload.
- A noninteractive result offers a supported attended-terminal route bound to
  the actual observed session, with no invented session or agent confirmation.
- Keep confirmation bound to the exact displayed mapping digest; changed
  proposals cannot consume a previous confirmation.
- Preserve unchanged-mapping receipt reuse and the independently valid V3
  fallback; optional mapping confirmation creates no plan-approval gate.
- Cover interactive success, understandable wrong input, noninteractive
  guidance and unchanged reuse in targeted transport tests.

## Triage

- **Decision:** Strong toil reduction within the existing 0.7 bootstrap scope.
- **Assignment:** Model-role bootstrap CLI and its entry guidance.
- **Date:** 2026-09-28.
