# Reader review phase two — greenfield-062-r2

Independent evidence check of the seven phase-one findings against reviewed
commit `19f99b5624ecf60aa1f9aae2b35e77043d8f26ab`. The reviewer received the
phase-one report and the public documents, but no conversation or change
history, and made no file changes.

- **RR-R2-01 — confirmed.** Cut the duplicate lifecycle diagram in both
  languages. It turns conditional gates into a misleading linear sequence.
- **RR-R2-02 — confirmed.** Move source/overlay/runtime architecture out of
  the newcomer entry and cut the runner-detail repetition already covered by
  SETUP and PIPELINE_FLOW.
- **RR-R2-03 — confirmed with a narrower remedy.** Redistribute the capability
  anchors to maintained public reference surfaces and update the inventory
  targets atomically. Do not delete the 27 active capability bindings.
- **RR-R2-04 — confirmed.** Retarget the README quick-start link to the actual
  SETUP heading in both languages.
- **RR-R2-05 — confirmed.** Put approval-key and private-overlay instructions
  after the complete normal consumer path and remove routine step numbering.
- **RR-R2-06 — confirmed.** Make existing-repository adoption an explicit
  subsection of the shared Driver path instead of a competing top-level path.
- **RR-R2-07 — confirmed.** Distinguish `close-feature`, which ends the active
  feature lifecycle, from `close-block`, which is reserved for a stopped topic
  or a real runtime transfer.

Because every confirmed remedy changes public documentation, the reader-review
protocol requires a fresh two-phase round after the correction commit.
