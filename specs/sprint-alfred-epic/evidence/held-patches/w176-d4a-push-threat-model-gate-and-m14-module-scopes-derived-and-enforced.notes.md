# w176-d4a — the push threat model gate (D4a) at plan approval, push preparation and feature close, and the module scope derived and enforced in the dispatch briefing tool (M1.4) (candidate 19c)

Delta on w190 (the clone base is the repository state plus the delivered held patch w190, because both edit the same files). **Apply order: w190 first, then this patch.** `git apply --check` against the repository alone is expected to fail until w190 is applied; against the repository plus w190 it exits 0.

Criterion binding: AC-108 is the closest existing accepted criterion; this is a fresh bounded attempt under its unchanged Spec text. The PRD and the Spec are unchanged. Design source: rows D4a, M1.4 and F11 of `specs/sprint-alfred-epic/plans/candidate-19-plan-2026-11-02.md`.

## What it changes

Two pure decision modules (`lib/push-threat-model-gate.mjs`, `lib/module-dispatch-scope.mjs`) with their suites, and `scripts/module-slice-proposal.mjs` moved onto `readPrdModules` (no second implementation of the cut), come in the first commit of the slice. The wiring is:

- D4a, one decision at three places. While the manifest asks for a push approval (`gates.push.approval: required`) the file `project/push-threat-model.md` must exist as a regular file, hold more than whitespace and carry a markdown heading:
  - `pipeline-state.mjs submit-plan` (the plan approval request): after the PRD framing check and before any state write it prints the refusal text (code, repair command, commit rule) to stderr and exits 2; nothing is recorded.
  - `push-prepare.mjs` `checkPushThreatModel`: an active approval with a missing, empty or invalid model returns a failed check with `code`, `message` and `remedy`. The inactive path is untouched (an existing file passes, a missing one fails with the old remedy and no code).
  - `close-coordinator.mjs` transition plan for `feature-close-prepared`: before the coordinator is read it fails with the verdict code and the refusal text, so the Critic/audit step does not start and nothing changes. `readPushThreatModelState` uses the shared `pushApprovalActive`.
- M1.4, in `scripts/dispatch-briefing.mjs` (build and probe) and `lib/dispatch-briefing-build.mjs`: the package may carry the optional strings `module` and `modulePlan` (a PRD with the approved architecture design). Both or neither (`DBG-PACKAGE-FIELD-MISSING`); `paths` is required only without a module. `lib/dispatch-briefing-build.mjs` gets no new import. In the script, right after validation, `readPrdModules` and `moduleDispatchScope` resolve the reference (the integrated slice ids come through the same dependency the binding already uses): the declared `paths`, `newFiles` and a non-command `check` must not cross into the owned paths of another module (`DBG-MODULE-SCOPE-CROSSES`), and a module whose dependencies have no accepted result is `DBG-MODULE-NOT-RUNNABLE`. Without declared `paths` the scope is derived: the fixed directory prefix of every owned-path pattern is listed (a binding lists EXACT files) and the files the cut's own matcher accepts are the write scope, with the warning `DBG-MODULE-SCOPE-DERIVED` (a file created later needs a new briefing). A derived scope that is empty is refused with `DBG-MODULE-SCOPE-EMPTY` and a repair that names `newFiles`. In probe a refusal is one finding with check `module-scope`; the checks that need the write scope are listed under `skipped`. A package without a module reference behaves exactly as before.
- Kernel listing: `lib/push-threat-model-gate.mjs` (imported by pipeline-state, push-prepare and close-coordinator) is added to `NEVER_LIFTABLE_KERNEL_PATHS` in `lib/guard-maintenance-window.mjs` and named in `docs/guard-maintenance-window-threat-model.md`.
- Happy-path guide text that called the two rules advice now states they are enforced; the `invariantPinned` wording of `register-feature-package-readback-tests` and `module-slice-proposal-tests` in `harness/verify-suites.json` follows.

## Checks (clone)

Each suite was run alone with the private-TMPDIR helper; see the dispatch report for the exact commands and counts. The cases written before the wiring (4 module-package cases, 2 D4a refusals plus a pass case in close-coordinator, 1 in push-prepare, the submit-plan missing/empty/present block) were red against the original code and are green. Two of them were restated under QG-04 in the clone, each only in its fixture, never in an assertion about the rule: the submit-plan block reads the state file only when it exists (a refused submission writes none, so absence is the strongest form of "not recorded") and writes its manifest into the neutral authority tier (`project/pipeline.yaml`).

## Not changed / not proven

- Known open point, stated and not fixed: queue rows written by `slice-queue add` hold the owned-path PATTERNS while a binding lists EXACT files, so a module slice may report `DBG-QUEUE-ROW-DRIFT` end to end.
- The derived scope is a snapshot of the files that exist when the briefing is built; a module whose patterns have no fixed directory prefix (a bare `**` or a regular expression scope) contributes nothing to the listing and needs `newFiles` or declared `paths`.
- A derived scope larger than the native host's 64 exact files is refused by the existing `DBG-SCOPE-TOO-MANY-PATHS` (split the module work).
- A package with a module reference and an empty derived scope is accepted when it lists `newFiles` (the write scope is then the new files only).
- The threat model verdict checks existence, size, emptiness and a heading, not currency or content quality.
- No Full Verify and no Critic review; the independent review runs after the chain is built.
