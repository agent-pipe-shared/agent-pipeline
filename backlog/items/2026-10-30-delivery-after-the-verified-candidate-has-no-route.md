---
schema: pipeline.backlog-item.v1
id: pipeline.delivery-after-the-verified-candidate-has-no-route
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (findings N27 and N23); PO 2026-10-30: major, into candidate 11"
done_when: manual
---

# Delivery after the verified candidate has no route

## Evidence

1. Rollback tag (N27a): a consumer rule tags the pre-merge `main` commit as `rollback/<date>-<block>` before a
   fast-forward. Pushing that tag (an already pushed commit) was refused by the pre-push hook as a code push:
   `verify-latest.json … is stale` and `push approval missing or stale: expected forCommit=<old commit>`.
   Verify and approval for an old, already published commit can neither be met nor make sense. The PO pushed
   the tag through the human operator route.
2. Post-push commits (N27b): after the staging push the agent committed the handover (`docs/state.md`) and the
   Critic export. `push-init` for `main` then refused with `stale-commit` and `verify-evidence-not-exact-green`.
   The way out was pushing the detached verified commit; the two commits still need their own signed push.
3. Critic export as evidence (N23): an export commit under `specs/<f>/evidence/critic/<packet>/` does not count
   as an evidence commit in the carry-forward range (`evidenceCommitV2`, `lib/critic-course-admission.mjs`), so
   it ends in `VEP-CVL-CARRY-CONTENT-CHANGED` / `CCA-TRANSPORT-SOURCE-DRIFT`. No verb registers the export.

## Wanted

1. A tag push whose target commit is already reachable from a remote-tracking ref of the same remote (or a tag
   under `refs/tags/rollback/*`) passes the pre-push gate without Verify or approval for that old commit;
   every other tag stays gated. Pinned both ways.
2. `push-init` offers "deliver the verified candidate" when HEAD is ahead of it by handover-only or
   Critic-export-only commits: it names the exact push command for the verified commit, and the later commits
   keep their own route.
3. The Critic export is registrable as candidate evidence (or admitted by the carry check), so an export commit
   does not break the carry-forward.
4. One replay of the consumer sequence: staging push, handover and export commits, rollback tag, `main` push,
   with no operator route and no refusal on the way.
