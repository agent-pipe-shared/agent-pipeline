# Held patch w8-empty-tree-course-base-in-the-close-coverage (Elephant-built, PO exception for small items)

Found while closing the "not covered, named" list of the chain walk: a Critic course whose round 1 is a ROOT-candidate review has the
EMPTY TREE as its base (the preflight's `base.commit` is null; `critic-packet-preflight` admits that base for a root candidate). That is the
normal first round of a greenfield consumer. The close coverage in `scripts/check-critic-skip-coverage.mjs` read such a base as a commit:
`git merge-base --is-ancestor <record> <empty tree>` fails with "is a tree, not a commit", the failure is caught as "not covered", and the
close ends in `CLOSE-CRITIC-EVIDENCE-MISSING` although the course covers the record.

## Change

`scripts/check-critic-skip-coverage.mjs`: a constant for the empty tree and one helper, `gitIsAtOrBeforeBase` (false for the empty tree: no
commit lies at or before it; otherwise the unchanged ancestor test). Used at the three places that asked "is the record at or before the
base": the single-receipt range test (D212) and the course-chain genesis test (D217 B). The chain's per-round connectedness test
(`base` is an ancestor of `head`) accepts the empty tree for round 1. Every other path keeps its order and text.

## Tests, evidence

- `check-critic-skip-coverage.test.mjs`: `n35Repository({ emptyTreeGenesis })` builds the N35 course with round 1 based on the empty tree; the new
  case covers a record at the repository's first commit and one inside round 1 through the course, and keeps a record after the last
  candidate refused. RED first (the `is a tree, not a commit` error from git, log `c0`), 60/60 green after the change (log `c1`).
- Revert proof: the helper and the connectedness test put back to the old behavior make the new case fail again (log `rev1`), then restored.
- Clone (stacked on the six candidate 14 patches): chain walk, `dispatch-record-write` (40), the close-coordinator evidence pin (20) and
  `dispatch-authorship-verify` (74) green. The suite has no pinned assertion count (VCR01 untouched).
- Apply order: after `w8-chain-walk-suite-registration` (it edits the N35 code and the N35 test fixture).

## Measured, not changed: the cost of the course search

`defaultReadCourseHistory` reads each `specs/<feature>` package through `resolveRetainedCriticCourseRecords` (at most 256 features, cached
per repository root, HEAD and packet). Measured in a scratch repository: about 23 ms per feature with 3 manifest commits, about 100 ms per
feature with 40 manifest commits, i.e. a worst case of roughly 25 s for an uncached scan of 256 pathological features, once per HEAD and
packet; a typical consumer with a handful of features is in milliseconds. The scan only runs when the single-receipt test has already failed.
