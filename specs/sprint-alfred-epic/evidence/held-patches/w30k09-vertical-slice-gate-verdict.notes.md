# w30k09 — verdict: what a vertical-slice gate would assert, where it would sit, and whether it is needed beside Verify and acceptance (candidate 30k, C30K-K9)

Adds one analysis document, `specs/sprint-alfred-epic/plans/vertical-slice-gate-verdict-2026-11-18.md`, and nothing else. Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text; that text names another item); the PRD and the Spec are unchanged. The patch is a delta on the integrated 30j tree (the clone `int30j`): apply that tree first, then this patch. It does not apply to the real checkout alone (an exit 1 of `git apply --check` there is expected); `git apply --check` against the integrated 30j clone is the proof (exit 0).

## What

Analysis only, no test run. It states what "vertical slice" means in this repository's own words (Spec template, roles, module-slice code) and how a slice is cut and checked today, lists the failures of the 30h to 30j waves with the question whether one journey or recovery assertion would have caught each, states what a gate would assert, where it would run and what it would only report, and gives a verdict: **partly covered, a new gate is not needed**; the smallest stage is a read-only derived line inside the existing `journey-coverage` close row, after a read-only recon. Every claim is labelled PROVEN or INFERRED with a file:line. The document ends with Recommendation, DO-NOT-DO, a staged plan with failing-first proofs and neighbour suites, and open PO decisions with defaults. It builds on a first attempt under another dispatch; the load-bearing lines were re-read and one claim was corrected (the PO acceptance point of decision D33 is deferred by decision D136, not possibly built).

## Why

PO goal of candidate 30k: fewer duplicated states and rules, no new gate, analysis before code (`plans/candidate-30k-plan-2026-11-18.md`, lane K5).

## Not changed

No code, test, registry, PRD or Spec was touched; the analysis proposes no new stored status, gate, automatic re-bind, signature step or time-based expiry. The check test does not run `git apply` against the repository.

## Not proven

- No test or producer was run. Absences (for example that the word "journey" does not occur in the one-shot close script) are scoped to the files named in the document.
- Where the item-delivery criterion binding persists after integration, a consumer project's Verify evidence shape, the live effect of the vertical-first warning and Windows behaviour of the recovery paths were not measured (section 4 of the document).
- The greenfield second-run reports and the order of the acceptance question (queue line 496) were not re-read in this pass.
- Verify registration: the new check test file is not run by Verify until the Coordinator registers it.
