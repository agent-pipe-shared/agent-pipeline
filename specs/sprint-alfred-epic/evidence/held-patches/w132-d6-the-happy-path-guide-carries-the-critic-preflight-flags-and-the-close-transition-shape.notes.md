# w132 — D6: the happy-path guide carries the Critic preflight flags and the close transition shape

Found by the Antigravity run (priority 6): the guide marked several verbs "no syntax documented", so the agent read plugin sources and guessed subcommands (332 turns in the close phase).

Change (`skills/pipeline-start/references/happy-path.md`, text only):
- Critic step 1: `critic-dispatch-preflight.mjs` has no `--help` (it answers `CDP-ARGUMENT`), but that refusal names the complete flag set; the guide now lists it and says which flags a first round needs (`--root --base --candidate --spec --guardrail --evidence`).
- Close step 2: the `plan-transition` and `apply-transition` shapes taken from the usage of `close-coordinator.mjs` (`--root --lifecycle --actor --phase`, then the same plus `--plan-sha256 --activate`), and the `next <phase>` command that prints what a phase needs.
- The "gaps" list says what is still open: a complete `approve-plan` line stays undocumented (a PO ceremony, follow `inspect`); the per-phase evidence options are what `next <phase>` prints.

Checks: `happy-path-guide-names-only-existing-scripts.test.mjs` 2/2 and `three-runner-happy-path-with-two-po-approvals.test.mjs` 22 tests, 21 pass, 1 skipped by its own design. Every flag listed was taken from the script's own refusal or usage text, none invented.

Not changed: the dispatch-record, finalizer and guard-override verbs of the report (their exact request shapes are in their own `--help`; the lasting fix is the generated runbook C19-G5). Not proven: no agent followed the new lines end to end.
