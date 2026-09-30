---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-machine-output-and-skill-budget
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review M6/M7: pending asks appear twice, guard denials emit lengthy inline override instructions, and the mandatory start skill is roughly 35 KB across three runner contexts."
sprint: alfred
done_when: manual
---

# Bound startup and refusal output to the active runner and next action

## Acceptance

- Emit each pending ask once in the CLI's machine response while keeping the
  internal full audit record available by reference.
- Put long human-override instructions behind a bounded read-only help action
  keyed by the exact refusal or request digest; retain the first-line reason,
  explicit scope and reachable recovery action inline.
- Split runner-specific bootstrap detail into lazy references and keep the
  mandatory start skill's common path concise. Do not omit security or PO
  boundaries from the common path.
- Measure first-run and denial output bytes for all three runners and assert
  a stable budget in tests. Confirm that an agent can still follow the exact
  action without reconstructing commands.
