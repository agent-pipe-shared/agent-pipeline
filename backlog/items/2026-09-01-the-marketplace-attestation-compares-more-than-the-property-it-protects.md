---
schema: pipeline.backlog-item.v1
id: pipeline.the-marketplace-attestation-compares-more-than-the-property-it-protects
type: defect
owner: pipeline
status: open
created: 2026-09-01
source: "PO observation during the 0.6.0 release push, 2026-09-01: the AGY-MKTATTEST-1 push-time check fired on eight unrelated files immediately after `approve-push` signature consumption, forcing a manual external-marketplace sync inside the one window the documented ordering rule forbids any other change."
sprint: nova-b
---

# The marketplace attestation compares more than the property it protects, making a manual sync structurally mandatory on every release push

## Description

`checkMarketplaceAttestation()`
(`plugins/pipeline-core/hooks/guard-push.mjs`, ~line 1842) is a hard,
blocking push-time check, active only for a Pipeline-source checkout
(AGY-MKTATTEST-1, closed backlog item
`2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md`).
It reuses `localPluginInstallSourceObservation()` /
`externalLocalMarketplaceObservation()`
(`plugins/pipeline-core/lib/human-guard-override.mjs`), which — verified by
reading the code, not assumed — hashes the ENTIRE `plugins/pipeline-core`
tree: `pluginSourceTreeSha256()` (line 264) recursively walks every file
under `sourceRoot`, sorted, and folds every file's own sha256 into one tree
digest, with no narrowing to guard/hook code. The external comparison side
(`externalPluginSourceTreeSha256()`, the real-directory-copy branch of
`externalLocalMarketplaceObservation()`, lines 537–548) applies the identical
walker to the external copy and requires the two digests to be byte-for-byte
equal. Any divergence anywhere in the tree — one byte, one file, regardless
of whether it is guard logic or a documentation mirror — fails the push
closed with `HGO-EXTERNAL-MARKETPLACE`.

## The property, stated fairly

The guards that authorize a push execute from the INSTALLED external
marketplace copy (per ADR-0052's local-marketplace convention,
`~/agent-pipeline-local-marketplace/plugins/pipeline-core`), not from the
checkout. If the two differ, code other than what is being shipped vetted
the push. That is a real attestation property, and this item does not argue
against it — the underlying security property must stay true at the moment
it is load-bearing (publication), exactly as the closed item that introduced
this check established.

## The gap

The check compares the whole plugin tree for byte-identity and fails the
push on any difference, without regard to whether the differing file could
have changed the outcome of the authorization it protects. Measured live on
2026-09-01 during the 0.6.0 release: it fired on eight files — the two
runner plugin manifests (differing only in the local-candidate version
stamp), two vendored documentation mirrors, and four files of an unrelated
CI repair (`verify-journal.mjs`, `onboarding-continuity.mjs`, and their two
test files). None of those eight is guard or hook code; none could change
the outcome of the authorization it was protecting — a version stamp, a
documentation mirror, or an unrelated module change cannot alter what
`guard-push.mjs`/`human-guard-override.mjs` actually enforce for a push
whose authorization those unchanged files vetted.

## The history, from the code's own comment

This assertion previously lived inside `human-guard-override.test.mjs`'s F1
case, run by every `verify.mjs` invocation, and — per the block comment
above `checkMarketplaceAttestation()` — "went red on every ordinary commit
touching `plugins/pipeline-core/**` during active development, not only on
real drift." It was moved to push time (AGY-MKTATTEST-1, Direction 3) to
stop that. The breadth of the comparison — the whole tree — was never
narrowed by that move; only the MOMENT it fires changed, from every commit
to push time.

## The structural consequence, which is the point of this item

The only remedy is a `rm -rf` plus `cp -a` into a directory OUTSIDE the
repository (the external local-marketplace root, `~/agent-pipeline-local-
marketplace/...` per the ADR-0052 convention), where an agent may not write
(cross-repository mutation guard). In a repository whose product IS the
plugin, every release push changes files under `plugins/pipeline-core/`.
A manual human sync is therefore guaranteed on every release push by
construction, not exceptional — the whole-tree comparison converts a
narrow, load-bearing security property into a universal release-blocking
step regardless of what actually changed.

**Timing cost observed 2026-09-01:** the check fired AFTER the human's
signature had been consumed by `approve-push` and BEFORE `git push` — the
one window in the whole flow where the documented ordering rule forbids any
other change (CLAUDE.md, "No tree mutation while a HEAD/tree-bound PO
command is outstanding"), and where the human had already been told the
remaining steps were the agent's. This is the umbrella pattern this repo
already has open as
`backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`
(Block F): a gate binding the whole tree voids on any following change
regardless of relevance, forcing serialization or, here, a human ceremony
at the worst possible moment in the flow.

## Relationship to the closed verify-time item

This item is the PUSH-TIME counterpart of the closed
`2026-08-24-verify-marketplace-attestation-blocks-normal-active-development.md`,
not a reopening of it. That item was about WHEN the comparison fires
(every commit vs. push time) and was resolved by moving the assertion to
push time while keeping it hard-blocking there. This item is about WHAT the
comparison covers once it fires at push time: the whole tree, including
files that cannot affect the authorization outcome it protects.

## Proposal — options only, no decision made here

1. **Narrow the comparison to the executable guard surface** (`hooks/` plus
   the modules they import) excluding documentation mirrors and version
   stamps. Trade-off: requires maintaining an explicit, curated boundary of
   "what counts as guard surface," which can itself drift or be gamed by
   misclassifying a file, and turns a simple whole-tree hash into a policy
   surface that needs its own review.
2. **Replace equality with provenance**: record WHICH guard version
   (commit/tree hash) authorized the push instead of requiring the external
   copy to equal the shipped tree at push time. Trade-off: equality is
   transient by construction (the shipped tree changes with every push that
   touches `plugins/pipeline-core/`), whereas a recorded authorizing version
   stays auditable after the fact and needs no human sync — but this
   changes what is being attested (a durable record of what ran, not a
   live guarantee that the external copy is currently correct), and needs
   its own tamper-resistance story for the recorded provenance itself.
3. **Keep the current breadth but move the check EARLIER**, before
   signature consumption, so it cannot fire in the window between
   `approve-push` and `git push`. Trade-off: does not reduce the human-sync
   burden itself (a whole-tree mismatch still blocks, still needs a manual
   `rm -rf`/`cp -a`), only moves WHEN in the flow the human discovers it —
   avoiding the worst-timing case (mid-ceremony) but not the
   every-release-touches-the-plugin-tree structural guarantee that a sync
   will be needed.

None of these three is recommended over another here; a design decision
needs the same Advisor-designed, PO-accepted shape the closed item used for
its own directions.
