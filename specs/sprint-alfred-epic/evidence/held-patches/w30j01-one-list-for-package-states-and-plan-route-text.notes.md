# w30j01 — one list for the nine package states and the phase set; the plan rejection names its route (candidate 30j, slice C30J-J1)

Applies AFTER the integrated 30i tree (the delta is `69ac37983f..HEAD` of the slice clone, which starts at that tree). It does not apply to a checkout that lacks the 30i chain; `apply --check` against the 30i tree is exit 0. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it does

- Package states: `FEATURE_STATES` (owner `lib/feature-package-topology.mjs`) is now the one list. `scripts/check-artifact-topology.mjs` exports `TOPOLOGY_STATES` as that same list (it already imported the topology module for `validateFeatureTopology`, so the literal was not an avoidance of an import: no cycle, no reason found for the copy). `lib/evidence-view-model.mjs` builds `PACKAGE_STATES` from it. Values and order are identical; no record, digest or key byte is affected.
- Phase set: the two inline `new Set(["design", "implementation"])` in `scripts/pipeline-state.mjs` are one named constant `ACTIVE_FEATURE_PHASES`.
- Plan route: `pipeline-state.mjs feature-package-plan` for an invalid current package now adds a `nextAction` to the rejection (the plan object keeps every existing field). It names `feature-package-status` (read the findings), `feature-package-rebind-mutable` (mutable-class digest), `feature-package-reconcile` (Result entry, PO signature only when the plan changes more than the Result entry) and says an immutable artifact is never rebound. `reconcileSigningRoute` is now exported so a later refusal text can name the full signing command from its own state; this slice does not call it from the plan rejection, because the plan command has no Continuity State and no preview digest to build the signing subject from.

## Test-first

Cases were written and run RED before the production edit: `check-artifact-topology.test.mjs` (list identity), `evidence-view-model.test.mjs` (no literal copy), `pipeline-state.test.mjs` (one phase literal; the rejection carries `nextAction` with the three commands; a rejection for another reason gains no field). The pipeline-state RED run printed no assertion text (the file asserts at top level and the runner hid it), so its red state is attested by the exit code 1 only. After the edit all green.

## Checks run (tests only)

- `check-artifact-topology.test.mjs`: 1 of 1, exit 0
- `evidence-view-model.test.mjs`: 13 of 13, exit 0
- `feature-package-topology.test.mjs`: 1 of 1, exit 0
- `external-reference-adapter.test.mjs`: 39 of 39, exit 0
- `pipeline-state.test.mjs`: 1 of 1, exit 0

## Not changed / not proven

- A third phase literal `PHASES` lives in `lib/plan-spec-state-v2.mjs` and one in `lib/guard/sanctioned-args-scripts.mjs`; both are outside the write list (the second is a protected guard file) and are reported, not edited.
- The source-text tests (no literal, one phase literal) are structural pins, not behaviour tests.
- No stored status, record shape, gate, signature, approval or digest changed.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: verified by tests only.
