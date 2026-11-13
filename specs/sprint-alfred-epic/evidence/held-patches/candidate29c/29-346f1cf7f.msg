fix(design-review): export-report names why the last reviewer stop was not observed

A background reviewer stop that could not be observed (no model in the
child transcript, an unsafe transcript, no returned text) reported its
DRO code only on the stderr of a hook that exits 0, where it is easily
lost; export-report then said only that nothing was recorded. The hook
now keeps the latest such code and time beside the records
(last-unobserved.json, overwritten, code and time only), and
export-report names it in DRC-OBSERVATION-MISSING.

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
