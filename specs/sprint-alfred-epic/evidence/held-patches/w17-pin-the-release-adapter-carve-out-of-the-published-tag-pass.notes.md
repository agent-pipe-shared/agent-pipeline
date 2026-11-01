# Held patch notes — pin the release-adapter carve-out of the published-tag pass (candidate 15c)

Patch: `w17-pin-the-release-adapter-carve-out-of-the-published-tag-pass.patch` (test only; independent of the other 15c patches).

## Why

`backlog/items/2026-10-30-candidate11-follow-ups.md` item 5 lists: "The guard-push release-adapter carve-out of the published-tag pass has no dedicated case."
`guard-push.mjs` (N27a, around the published-tag pass) skips the pass when the pushed tag matches a declared release adapter trigger ("a deployment is not nothing new")
and fails toward the gate when the trigger declaration is unreadable. No case pinned the first half: removing the `!triggersReleaseAdapter` condition would have kept every
existing case green.

## What

`plugins/pipeline-core/hooks/guard-push.test.mjs`, two cases in one block (a repo whose release adapter triggers on `refs/tags/rollback/*`, with a required-approval push gate,
commit already on the same remote):

- PG-N27-TAG-12 block: a `rollback/*` tag on a PUBLISHED commit stays gated. The expected refusal is the deploy branch ("deploy-triggering ref", "unused deployApproval"),
  not the missing-evidence text: the pass runs before the deploy branch, so a deploy-branch block proves the pass was not taken.
- PG-N27-TAG-13 allow: a non-triggering tag (`checkpoint-…`) on the same published commit still passes — the carve-out is narrow.

No production code change. Cases in the runner: 272 -> 274 (the file prints its own total).

## Evidence

Scratch clone: `node plugins/pipeline-core/hooks/guard-push.test.mjs` 274/274 pass. Not covered: an unreadable trigger declaration (the "uncertain" branch) — still without a case.
Pending: Full Verify, batch Critic, native runs, PO acceptance.
