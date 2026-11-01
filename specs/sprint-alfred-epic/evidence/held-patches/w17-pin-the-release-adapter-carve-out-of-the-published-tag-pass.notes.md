# Held patch notes — pin the outcome for a tag that triggers a release adapter (candidate 15c)

Patch: `w17-pin-the-release-adapter-carve-out-of-the-published-tag-pass.patch` (test only; independent of the other 15c patches; the file name keeps the first commit's wording).

## Why

`backlog/items/2026-10-30-candidate11-follow-ups.md` item 5 lists: "The guard-push release-adapter carve-out of the published-tag pass has no dedicated case."
`guard-push.mjs` (N27a published-tag pass) skips the pass when the pushed tag matches a declared release adapter trigger and fails toward the gate when the trigger declaration is unreadable.

## What

`plugins/pipeline-core/hooks/guard-push.test.mjs`, two cases (a repo whose release adapter triggers on `refs/tags/rollback/*`, required-approval push gate, commit already on the same remote):

- PG-N27-TAG-12 block: a `rollback/*` tag on a PUBLISHED commit stays gated. The refusal is the deploy branch ("deploy-triggering ref", "unused deployApproval").
- PG-N27-TAG-13 allow: a non-triggering tag (`checkpoint-…`) on the same published commit still passes.

No production code change. Cases in the runner: 272 -> 274.

## Measured limit — read before relying on these cases

A mutation check in the scratch clone showed these cases do NOT pin the carve-out line itself:

- Deleting the `!triggersReleaseAdapter` condition in `guard-push.mjs` leaves the runner at 274/274: the deploy branch refuses an adapter-triggering tag on its own, so the carve-out is
  defense in depth. TAG-12 pins the observable outcome (an adapter-triggering tag cannot ride the published-tag pass), not the redundant line.
- The "uncertain trigger" branch (`collectTriggerPatterns` -> `uncertain`) is not reachable through a manifest: a trigger whose `refs` is not a string array is rejected by the
  manifest validator and that manifest blocks in the deploy branch before the pass matters (mutating `releaseTriggers.uncertain` to false also left the runner green). A case for it
  needs a unit seam on `collectTriggerPatterns` (not exported); not built. Follow-up item 5 stays partly open for that reason.

The first commit's message for this patch says it "pins the carve-out of the published-tag pass"; that overstated it — this note and the commit that corrects it are the record.

## Evidence

Scratch clone: `node plugins/pipeline-core/hooks/guard-push.test.mjs` 274/274 pass. Pending: Full Verify, batch Critic, native runs, PO acceptance.
