---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-map-currency-is-checked-only-at-git-push
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N25); PO 2026-10-30: major, into candidate 11; the block itself is right, its timing is the defect"
done_when: manual
---

# Architecture map currency is checked only at `git push`

## Evidence

`guard-push` refused the push with "final candidate needs a current architecture map. 2 declared public
contract(s) changed after their concept map." (`lib/architecture-push-currency.mjs`,
`inspectArchitecturePushCurrency`: the last commit of each declared `publicContracts` path is compared with the
last commit of its concept map). It came after Critic, Verify, residual acceptance and the push signature had
passed. The map commit after the candidate invalidated all of them: one push signature, one residual-acceptance
signature and one Critic round were lost. The refusal named only the count, not the paths.

## Wanted

1. The same check runs early: as its own line in `push-init`, in the Critic dispatch preflight or
   `packet-ready`, and if feasible in Verify. One shared function, no second implementation.
2. Every refusal names the stale contract paths, their concept maps and the sanctioned step.
3. Decide one relief and pin it: comment-only contract changes do not count as stale, or a commit that only
   changes `architecture/map/*.md` is admitted in the carry-forward range.
4. Test: change a contract file in a comment only, leave the map, run `push-init`: red, with paths (or green,
   if relief (a) is chosen, pinned the same way).
