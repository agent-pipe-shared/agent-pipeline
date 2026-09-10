# Reader review phase one — greenfield-062-r2

Fresh blind read of the eleven public entry documents at reviewed commit
`19f99b5624ecf60aa1f9aae2b35e77043d8f26ab`. The reader received no reports,
inventory, governance, source, diff, history, or conversation.

- **RR-R2-01 — Duplicate lifecycle block.** Cut `README.md:97-119`; it
  duplicates the preceding flow and presents plan, readiness, Critic, and
  human completion as uniformly mandatory where PIPELINE_FLOW makes them
  conditional.
- **RR-R2-02 — Internal roots still dominate the entry.** Move
  `README.md:121-155` out of the newcomer path; source, overlay, and runtime
  architecture precede practical guidance at the wrong granularity.
- **RR-R2-03 — Operational capability catalog dominates README.** Remove or
  move `README.md:226-313`; it repeats roles, evidence, and boundaries in
  abstract form.
- **RR-R2-04 — Broken section label.** `README.md:76` points to a SETUP
  section named “Adopt a project”, but no such heading exists; the actual
  routine heading begins at `SETUP.md:41`.
- **RR-R2-05 — Optional setup reads as routine.** Move optional approval-key
  setup and Advanced Overlay at `SETUP.md:296-348` behind the normal consumer
  path; their current numbering and placement imply mandatory onboarding.
- **RR-R2-06 — Competing adoption paths.** `SETUP.md:352-374` overlaps with
  section A, which already covers existing projects. Cut it or make it an
  explicit subcase of the Driver path.
- **RR-R2-07 — Close route is ambiguous.** `PIPELINE_FLOW.md:205` presents
  `close-block` as the general close route without explaining its relation to
  “close the feature” in `docs/usage.md:81`. Remove that skill reference or
  point to the precise close contract.
