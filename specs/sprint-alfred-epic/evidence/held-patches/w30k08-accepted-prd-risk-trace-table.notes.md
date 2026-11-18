# w30k08 — analysis: how a risk accepted in a PRD is traced to a test, a gate or a stated residual, and where that trace is lost (candidate 30k, C30K-K8)

Adds one analysis document, `specs/sprint-alfred-epic/plans/accepted-prd-risk-trace-table-2026-11-18.md`, and nothing else. It redoes lane K4, whose findings were returned only as text because its file write was refused. Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text; that text names another item); the PRD and the Spec are unchanged.

Order of application: the patch is a delta on the integrated 30j tree (the clone `int30j`). `git apply --check` printed exit 0 against that clone and, because the patch only adds one new file, also exit 0 against the repository HEAD of this dispatch; apply the integrated 30j tree first anyway, then this patch, so the document sits on the tree it was read from.

## What

Analysis only, no test run. It lists where a risk, an accepted residual, an out-of-scope statement and a stated assumption are recorded (PRD and Spec templates, readiness reviewer, criterion registry, plan hand-off, Verify and case-completion registries, close quality readback, residual carriers, backlog falsifier), traces the chain from "risk accepted in the PRD" to "something fails when it materialises" link by link with file:line, and cites eleven examples from this repository. It corrects the first attempt in one respect: two existing mechanisms that carry criterion ids from a Spec to evidence (the opt-in `<spec>.requirements.json` map and the `traceability.md` reconciliation at design approval) are named and weighed against a separate reader. Every claim is labelled PROVEN or INFERRED, with the searched scope stated for each absence. It ends with Recommendation, What stays unchanged (DO-NOT-DO), a staged plan with failing-first proofs and neighbour suites, and open PO decisions with defaults.

## Why

PO goal of candidate 30k: fewer duplicated states and rules, no new gate, analysis before code (`plans/candidate-30k-plan-2026-11-18.md`, lane K4/K8).

## Not changed

No code, test, registry, PRD or Spec was touched. The analysis recommends no stored status, no new gate and no signature step; the one expiry-like option (an owner and due date on a residual) and the one gate-widening option (reusing the existing register for risk ids) are flagged as PO decisions with their cost. The check test does not run `git apply` against the repository.

## Not proven

- No test or producer was run. Absences are scoped to the files and patterns named in the document, not to the whole repository.
- Not measured: whether the 14 unresolved originals of the Spec were resolved, the enforcement code of the `unavailable` role state, the J25 pin cases, how many open backlog items declare `done_when`.
- Test-first record for this dispatch: the check test was written first and ran RED (2 of 2 failing, the patch file absent), then GREEN (2 of 2 passing) after the patch was saved. No self-attested test-first evidence file is returned, because it would sit outside the write scope.
- Verify registration: the new check test file is not run by Verify until the Coordinator registers it.
