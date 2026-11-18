# w30k01 — a counted inventory of duplicated state and rules, ranked by blocking and drift (candidate 30k, slice C30K-K1)

Applies AFTER the integrated 30j tree (the clone `scratch/agent-out/c30g/int30j`): the patch is a delta on that tree and does not apply to the real HEAD until it is (`apply --check` is exit 0 against `scratch/agent-out/c30g/int30j`; an exit 1 against the real repository is expected). The check test therefore never runs `git apply`. Order: integrated 30j tree, then this patch. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: analysis only, no test run.

## What

- One new document, `specs/sprint-alfred-epic/plans/duplicated-state-and-rules-count-2026-11-18.md`: what 30j and the earlier chains already closed (13 entries, so nothing is counted twice), the ten biggest duplicates ranked by (blocks today) then (drift seen) then (cheap to merge), five more counted below the ten, a closed-versus-open table, a list of what is missing, then Recommendation, DO-NOT-DO, a staged plan with a failing-first proof and neighbour suites per stage, and open decisions with a default.
- Every claim about code or a document carries a file:line reference and is labelled PROVEN or INFERRED; search counts are called search counts.
- No code, no test, no registry change. No new status, gate or Verify step is proposed; wiring a check into Verify, retiring a calibration twin and restructuring `docs/state.md` are listed as PO decisions with their cost.

## Why

PO goal for candidate 30k: fewer duplicated states and rules, no new gate, analysis before code (`plans/candidate-30k-plan-2026-11-18.md`, lane K1).

## Not changed

- Nothing outside the one document. The three deliverable files of the dispatch are this notes file, the check test and the patch.
- The queue, `docs/state.md` and the plan are not edited; the analysis only cites them.

## Not proven

- Nothing was run. Three findings are INFERRED, not measured: the staleness of the pinned registered-suite total, the staleness of the case-completion rows, and the equality of the clone-slice copies.
- The read rule of the five remaining calibration path lists, the guard selection per runner and `docs/state.md` beyond the cited lines were not read in full.
- Integrated review and PO acceptance are pending (Coordinator); Critic suspended and no Full Verify by PO decision.
- The check test file is a new file and is not registered in Verify; it needs registration in a protected suite list (operator step), as the earlier held-patch check files do.
