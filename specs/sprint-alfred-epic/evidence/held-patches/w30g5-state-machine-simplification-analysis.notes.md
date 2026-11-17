# w30g5 — state-machine simplification analysis and staged plan (candidate 30, slice C30G-SM1)

Criterion binding: AC-108 is the closest existing accepted criterion (a fresh bounded attempt under its unchanged text); the PRD and the Spec are unchanged. Held patch, developed in a scratch clone of the integrated candidate 30h plus 30i tree. The analysis ran on the design-tier model as a PO exception recorded for this one dispatch.

**Apply order.** The patch is the delta of the slice clone on the integrated candidate 30h plus 30i tree. It adds one new file and edits none. `apply --check` exits 0 against the integrated base clone and, because the patch only adds a file, against the repository HEAD as well; the document's claims describe the integrated tree, so apply it after that tree. The check test does not run `git apply`: it proves that the patch is non-empty and touches only the one document.

## What it adds

One new document, `specs/sprint-alfred-epic/plans/state-machine-simplification-analysis-2026-11-17.md`. No code, no test of product behaviour, no schema, no configuration. Its five parts:

- **A, inventory.** Eight state spaces, one table each: the values counted from the constant, the defining file, the writer, the readers, the second copy of the same fact, how a drift is detected, the repair, and whether an agent may run it. Corrections of the starting inventory: 33 controlling non-ready onboarding statuses (not about 30); `residualAcceptance` is not a field name in the State script; the legacy close journal's writers have no importer and the module has no command line.
- **B, taxonomy.** Seven root-cause classes: the six of the request plus one found in code, a binding that the Pipeline's own sanctioned next step invalidates (five members). Eleven incidents are mapped to classes, spaces and the state of their fix; one is an ordering defect, not a drift.
- **C, twelve ranked simplifications**, each with the blockings it removes, what it derives instead of stores, what stays, compatibility, size and risk, and a DO-NOT-DO list of twelve rules.
- **D, staged plan.** Fourteen slices in four stages with existing suites as proof, what each leaves unchanged and the rollback. First three: one list for the package states; a settled dispatch is not a running dispatch (warning path only); the test-only reproduction of the blocked signature ceremony.
- **E, five PO decisions** with a recommendation each, except one that is deliberately left open, and eighteen numbered items that were not verified.

## Why

PO request 2026-11-17: the many parallel status spaces regularly drift apart and every drift ends in a refusal somebody repairs by hand. The document shows where one fact is stored several times, which incidents each duplication caused, and which copies can become derived reads without touching a gate.

## Not changed

- No file other than the one document. No gate, signature, approval, push approval, Critic evidence, security scan or audit bundle is changed, and none is proposed to be weakened.
- One idea was withdrawn during the work on evidence: letting a HEAD moved only by evidence commits stand for the checked package candidate. The transition code requires a registered, passing Verify for exactly the moved commit and tree, so the idea would let a Verify result cover a later commit. It is listed as an open PO question with no recommendation.
- A self-healing read for an immutable or append-only artifact (the Result, the acceptance pointer, registered Verify evidence) is on the DO-NOT-DO list; the topology code says that separation is never made configurable.

## Not proven

- Nothing in the document was executed: no suite was run for it, no incident was reproduced. The two incidents reported from consumer sessions (the blocked ceremony and the close after a move-aside) are read in code or cited from the queue only.
- Section E2 of the document lists the gaps by space: among them the internals of the plan lifecycle module, the writers of the Continuity close phases, the onboarding producer, the complete set of registry member phases, the attestation code path, and whether the State file is tracked in consumer projects.
- Of the ADRs only the index titles and a few lines of ADR-0029 were read; `docs/state.md` and `docs/operating-model.md` were searched for keywords, not read; `backlog/` was not read.
- Sizes and risks of the proposed slices are estimates.
- The clone commits carry no `AI-Assisted` or `Dispatch` trailers (the one-line commit helper takes a single line); the patch is a diff and carries no message.
- The check test is a new file and is not run by Verify until it is registered in the suite list.
- Not run: the full Verify; integrated review and PO acceptance stay with the Coordinator.
