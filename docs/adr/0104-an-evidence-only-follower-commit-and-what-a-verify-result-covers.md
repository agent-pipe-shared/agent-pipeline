# ADR-0104: an evidence-only follower commit and what a Verify result covers

> Agent-Pipeline · Sprint Alfred · 2026-11-18

**Status:** accepted (2026-11-18, PO: Option A, the exact-commit binding stays). The PO first released Option B; two build attempts stopped on recon, and the PO then kept Option A. Finding 1: rule 3 (no path of the Verify's input set) cannot be derived, because the registered `pipeline.verify-evidence.v0` record has no input set, the per-suite receipts that list inputs are private, unregistered and machine-local, and every Tier A suite declares the whole tree as its input; rule 3 could only be a path-class policy. Finding 2: rule 2 (written by the owned commit route) cannot be tested from anything committed or registered, because a hand commit reproduces the owned message byte for byte, the close writes its own final output commit through printed git steps and not through `commit-pipeline-owned.mjs`, and the writer-capability store is private and not written for evidence paths. Rule 4 exists only in the weaker form "prior manifest entries byte-identical, digests match the bytes". A future Option B needs a stored provenance field and therefore a new ADR. The original text below is kept as the record of the options. Origin: PO tile E1-1 ("yes, ADR first") of the state-machine simplification analysis (items C12 and B3, class C7). The closest existing accepted criterion is AC-112; the PRD and the Spec are unchanged by this decision.

*Original status line (superseded):* proposed (2026-11-18); until released, Option A stays in force and no code changes. Origin: PO tile E1-1 ("yes, ADR first") of the state-machine simplification analysis (items C12 and B3, class C7). The closest existing accepted criterion is AC-112; the PRD and the Spec are unchanged by this draft.

**Context source:** the Critic diagnostic already accepts a HEAD that is the checked candidate plus evidence-only follower commits (classifier `classifyRegisteredEvidenceOnlyCommits`, 30f wave). The package candidate does not: it is bound to exactly HEAD.

## Problem

The close commits its own evidence (registered evidence, close outputs). Each such commit moves HEAD. The package record binds its candidate to HEAD, so after the close's own evidence commits the package must leave `completed`, go to `verifying` (the `requalifies` exit), pass the stage `requalify-candidate`, which needs a registered, passing Verify run for the moved HEAD, and only then return to `completed`. Each close pays one exit, one close stage and one second Verify run for a commit that changed no code. The cost follows from a real gate: a Verify result must cover exactly what is delivered. The question is whether that gate may be stated by a derived rule instead of by commit equality.

## Options

**Option A: keep the exact-commit binding (today).** The package candidate equals HEAD. Any new commit, evidence-only or not, requires a Verify run on it. Cost: the exit, the stage and the second run per close.

**Option B: the package candidate uses the same evidence-only follower definition as the Critic diagnostic.** HEAD counts as the candidate when it is the checked candidate commit plus follower commits, and every follower satisfies ALL of these:

1. Paths: every path a follower changes is a registered-evidence or close-output path that the classifier already lists (the evidence directories and the close's owned outputs), nothing else.
2. Author: the follower was written by the Pipeline's owned commit route (`commit-pipeline-owned.mjs`, the route that carries the evidence manifest), not by a hand or an agent commit.
3. No code or test: no follower adds, changes, renames or deletes a source file, a test file, a configuration or a guard path, and none touches a path that is in the Verify's input set (the files the Verify run read or executed, taken from its registered record).
4. Digest chain: each follower's changed files are listed in the registered-evidence manifest with their digests, and each manifest entry chains to the previous one, so the set of followers is derived from the commit range and re-checked, never stored as a new status.

Anything that fails one rule is not a follower; the package then behaves exactly as under Option A (requalify, Verify).

## What a Verify result covers

- Under A: the Verify result covers exactly the commit and tree it ran on, and that is the delivered commit. Failure mode: none of the "stands for another commit" kind; the failure is cost and a longer path with one more place to stall (the requalify stage).
- Under B: the Verify result covers the checked candidate commit and tree it ran on, and the record would ALSO accept a later HEAD made of that commit plus followers as "the same candidate". Failure mode: a Verify result standing for a commit it did not run on. This happens if a follower classifies wrongly (a changed path that is in the Verify's input set, a hand-written commit passing as owned, a manifest that does not match the bytes). The result would then claim assurance over bytes no Verify saw.

## Invariants under both options

1. The Verify evidence is bound to the commit and tree it ran on; it is never rewritten, re-bound or extended (registered Verify evidence stays immutable).
2. The delivered commit and tree are what the PO accepts; under B the acceptance names the delivered HEAD and tree and lists the followers, so the PO sees them.
3. No follower can change a path in the Verify's input set.
4. No new stored status, no change of a record shape, key or digest; B derives the follower set from the commit range on every read.
5. No gate, signature, approval, push approval, Critic evidence, security scan or audit bundle semantics change.

## Migration and rollback

No record is rewritten under either option. Records written under A stay valid under B (their candidate equals HEAD, the empty follower set). Under B a package that fails the follower rule takes the old path. Rollback means removing the follower rule from the package check: every record stays readable, and the next close takes the requalify path as before. Nothing is deleted.

## Tests that would prove B (if released)

- A follower that changes a source file, a test file or a guard path is refused and the package requalifies as today.
- A follower that changes a path in the Verify's input set is refused.
- A hand-written commit with evidence-only paths is refused (not the owned route).
- A follower whose manifest entry or digest does not match the bytes is refused.
- An out-of-order or missing digest chain link is refused.
- The exact candidate (no followers) behaves as today.
- A pin that the Critic diagnostic and the package use one shared classifier function.
- A record written under A is read unchanged under B.

## Recommendation (not accepted)

Recommend keeping Option A until the PO weighs the cost against the risk. If the PO wants B, build it behind the shared classifier first (analysis item C12, the definition only, which changes no check), then add the four-part rule above with the tests listed. The decision the PO needs to take: may a Verify result for commit X count for a HEAD of X plus owned evidence-only followers, as defined in rules 1 to 4, yes or no? Without a yes, every other simplification of the plan still works.

## Consequences

- Option A stays: no code, test or check changes. The status is accepted, and the row in the index says so. The recommendation above is adopted; a future Option B needs a stored provenance field and its own ADR.
