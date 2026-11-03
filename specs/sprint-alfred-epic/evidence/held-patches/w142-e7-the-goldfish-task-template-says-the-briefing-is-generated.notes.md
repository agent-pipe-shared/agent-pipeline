# w142 — the Goldfish task template says the briefing is generated (candidate 19, E7 template part, Claude Windows greenfield)

Applies on top of the chain at 55976a93a. Elephant-built small item, built in a clone.

## What it changes

- `templates/prompts/goldfish-task.md` and its vendored copy `plugins/pipeline-core/templates/prompts/goldfish-task.md` (kept byte-identical): a new first usage step states that the file is the field specification, that the dispatched briefing is generated from a closed package by `scripts/dispatch-briefing.mjs build`, and that filling the fields in a free-written prompt is the failure mode. E7 found that the template read as if hand-filling were allowed while the generated-briefing guard refuses it.

## Checks

- Run alone in the clone: `check-vendored-template-sync.test.mjs` 4/4, `guard-dispatch.test.mjs` 82/82, `dispatch-briefing.test.mjs` 155/155.

## Not changed / not proven

- `templates/prompts/critic-review.md` is NOT changed: it is listed in the pinned Critic preimage (`codex-isolated-critic-protected-preimage.v1.json`), which is never re-pinned here. The Critic template keeps its existing freehand warning; a matching sentence waits for the PO's re-pin.
- Other parts of E7 stay open: the `CDP-PATH` hint was done in w133; the PowerShell allow/refuse inconsistency needs the Windows transcripts; the Critic skill registering the receipt or saying "advisory" is not built.
- The derived files (Reader inputs, inventory) are refreshed by the apply script's last step. No full Verify run, no independent Critic review (suspended by the PO).
