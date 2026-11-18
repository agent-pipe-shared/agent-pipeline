# w30j11: ADR draft, what a Verify result covers with evidence-only followers

## What

Document only. A new decision record `docs/adr/0104-an-evidence-only-follower-commit-and-what-a-verify-result-covers.md` (status: proposed, the PO releases it) and its row in `docs/adr/README.md`. It states the problem (the close's own evidence commits move HEAD: one requalify exit, one close stage, one second Verify run), Option A (keep the exact-commit binding) and Option B (the package candidate uses the evidence-only follower definition of the Critic diagnostic, bounded by paths, author, no code or test change and no Verify input path, and the registered-evidence digest chain), what a Verify result covers under each with each failure mode, the invariants that hold under both, migration and rollback (no record is rewritten), the tests that would prove B, and a recommendation (keep A unless the PO answers yes) with the PO decision it needs. The recommendation is not written as accepted.

## Why

PO tile E1-1 = "yes, ADR first"; analysis items C12 and B3 (class C7). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Order of application

The patch is a delta on the integrated 30i tree (the clone base9), not on the real HEAD. Apply the integrated 30i tree first. `apply --check` on that tree: exit 0. An exit 1 against the real checkout is expected.

## Verification

- RED first: the check test was run before the patch existed and failed 3 of 3 (patch missing).
- GREEN: `node --test` of the check file (see the report for counts).
- In the clone: `check-adr-consistency.test.mjs` and `check-doc-contracts.test.mjs` pass.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify runs: tests only.

## Open: a file outside the write list is needed (stop condition)

`harness/scripts/check-doc-contracts.test.mjs` fails 3 of 76 in the clone with `OG-DOC-UNCLASSIFIED docs/adr/0104-...md`: every file under `docs/` must be listed in the `documentation.inventory` of `governance/observation-doc-governance.json` (sorted paths, in the group that holds the other ADR files). That file is outside the write list, so it was not edited. Needed change: add the ADR-0104 path to the ADR group of that inventory, in sorted position. Without it the drift test is red once this patch is applied.

## Not changed

No code, no check, no record shape, key or digest, no gate, signature or approval, no state or backlog file.

## Not proven

- The ADR number 0104 is taken from the briefing; ADR-0069 allocates numbers at acceptance, so the PO may renumber on release.
- Whether the classifier named in the draft covers every path rule written in Option B was not read in code (document only).
- No Critic review and no Full Verify ran.
