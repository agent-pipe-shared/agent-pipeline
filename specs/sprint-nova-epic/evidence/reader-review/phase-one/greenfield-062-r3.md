# Reader review phase one — greenfield-062-r3

Fresh blind read of the eleven public entry documents at reviewed commit
`a60c7f0aef4ab40e6eecd3d03d24275a1d8e362a`. The reader received no earlier
reports, inventory, governance, diff, history, or conversation and made no file
changes.

- **RR-R3-01 — canonical reader order.** README, SETUP, and the documentation
  map put Usage before PIPELINE_FLOW even though Usage assumes lifecycle,
  profile, risk, and readiness concepts. Put the lifecycle guide first.
- **RR-R3-02 — orphaned diagram reference.** README's optional-design prose
  refers to a dotted branch in the diagram above, but that branch was removed.
- **RR-R3-03 — misleading mandatory Critic path.** README's remaining role
  diagram routes every green gate result through Critic, while PIPELINE_FLOW
  and Usage make review depth profile-, risk-, and diff-dependent.
- **RR-R3-04 — unfulfilled fallback reference.** SETUP promises that “step 1
  below” exposes a directly invokable digest-bound fallback, but step 1 gives
  no complete command and routes back to the Driver.
- **RR-R3-05 — duplicate visible anchor syntax.** SETUP renders
  `{#consumer-onboarding-details}` in the heading while the next line already
  supplies the explicit anchor.
- **RR-R3-06 — stale version perspective.** SETUP describes unavailable
  features relative to “0.5.0 CLI features” inside the 0.6.2 guide, leaving
  their current status ambiguous.
- **RR-R3-07 — forensic detail in user guidance.** Move the historical probe
  detail in `docs/parallel-work.md:55-66` to its linked evidence record; keep
  the actionable parallel-work rule in the public guide.
