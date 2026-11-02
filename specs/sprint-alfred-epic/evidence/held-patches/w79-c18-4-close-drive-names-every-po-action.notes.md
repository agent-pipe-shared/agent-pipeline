# w79 — close-coordinator `drive` lists every close action up front and gains a read-only `--dry-run` (candidate 18, C18-4 / C18-11)

Applies on top of the w73 `drive` helper (base: the applied chain at c9a73fb80d6f587efb5e3cd595a87fa5ae480e03). Criterion binding: AC-264 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/close-chain-guide.mjs`: `describeCloseActions(phase, { root, lifecycle })`, a pure function returning ONE ordered list (`pipeline.close-coordinator.actions.v1`). Each entry has `order`, `id`, `who` (`agent`, `po-only` or `unclassified`), `command`, `source` and `mayRefuseWith`.
  - From `active`/`checkpointed` the list now includes the Continuity Result steps that w73 did not name: `result-bootstrap-plan`, `result-bootstrap-apply`, `reconcile-signature` (`po-only`) and `reconcile`, placed before `feature-close-prepared`, exactly in the order of the close-feature SKILL's "Closing a feature with active Continuity" route (steps 3 to 5).
  - The remaining coordinator phases follow; a phase is `po-only` exactly when the existing requirement table marks it a human gate (`publication-authorized`, `release-eligible`, `promoted`), otherwise `agent`. Nothing is classified by invention; a phase without a table entry would read `unclassified`.
  - `mayRefuseWith` lists only refusals the SKILL itself names (`SDC-AUTHORITY-UNAVAILABLE`, `COR-BINDING-HELD`).
  - The list ends in `nextHumanGate` (the first `po-only` step, or `null`) and a one-line `resumeCommand`.
- `scripts/close-coordinator.mjs drive`: every output now carries `actions`; the `human-gate` output also carries `nextHumanGate` and `resumeCommand`. Resumability is the existing one: the coordinator phase is stored, so a second `drive` call after the human step continues from there. No new persistent state.
- `drive --dry-run` (cannot be combined with `--apply`, `CLOSE-ARGS`): checks feasibility of the NEXT step only and reports `feasibility.state` as `ready`, `blocked` (with a typed `code`: `CLOSE-INPUTS-MISSING` with the missing input names, or the code the existing read-only `transitionPlan` refuses with, for example `CLOSE-RESULT`) or `po-only`. It writes no receipt, takes no lock and reserves nothing; it calls only the existing read-only plan.

## Checks

- `close-chain-guide.test.mjs`: 6 of 6 (new AC-264 case RED first, on the missing export). `close-coordinator.test.mjs`: 48 of 48 (new AC-264 process case RED first). `check-consumer-safe-paths.test.mjs`: 9 of 9.
- The new process case sits in the already registered `close-coordinator.test.mjs` and the guide case in the registered guide suite, so no new registration is needed.

## Not changed / not proven

- No plan/apply pair, lock, signature or code changed; the close-feature SKILL and docs are untouched (a later docs slice).
- Steps after the next one are not feasibility-checked: they depend on the earlier step's output. The Result bootstrap and reconcile steps are listed but not probed by `--dry-run` (their state belongs to the State writer, outside this slice).
- `COR-REQUESTER-UNAVAILABLE` and `COR-NO-CATALOGUE` are not named in the existing chain sources, so they are not listed in `mayRefuseWith`; a dry run reports a `COR-` code only if the plan itself raises it.
- The full Verify run was not made.
