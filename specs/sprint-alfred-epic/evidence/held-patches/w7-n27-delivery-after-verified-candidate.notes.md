# Held patch notes: W7-N27 delivery after the verified candidate (D206, wanted 1, 2, 4)

Patch: `w7-n27-delivery-after-verified-candidate.patch`, written against the N26+N25-stacked candidate in `cand.txt` (apply-check on the plain clone is printed by the driver `patch` mode). Wanted 3 (Critic export as evidence, N23) was already delivered by a5ef72071 and is only reused.

## Changed gates and the tests that pin them

| Gate / change | File | Pinned by |
|---|---|---|
| One shared predicate `classifyPublishedTagPush` (+ `RELEASE_TAG_REF`, `isGatedTagRef`): a non-release tag whose target, peeled to a commit, is reachable from `refs/remotes/<same remote>/*` | `lib/published-tag-push.mjs` (new) | `lib/published-tag-push.test.mjs` (5 cases) |
| Agent gate: tag-push pass after source-commit resolution; `resolvePushedTagRef` shared with the release-tag ancestry check; `RELEASE_TAG_REF` now imported from the lib (one definition) | `hooks/guard-push.mjs` | `hooks/guard-push.test.mjs` PG-N27-TAG-01..11; `hooks/guard-push-release-tag-ancestry.test.mjs` unchanged and green |
| Generated pre-push hook: imports the predicate exactly like the private-approval overlay, applies it for `refs/tags/` updates before the evidence and approval checks, logs `note: tag on an already published commit (PTP-PUBLISHED)` | `scripts/pre-push-hook-install.mjs` (`renderImpl`) | `scripts/pre-push-hook-install.test.mjs` N27a x6 (rollback passes, annotated peel, gated tags stay refused, other remote/URL never counts, import + runtime-snapshot inventory, refresh of an older install carries the new bytes) |
| Range classifier `classifyVerifiedDeliveryTail` (handover-only commit, or `criticExportOnlyCommit`; no second classifier) | `lib/critic-course-admission.mjs` | push-init anchor and negative pins |
| push-init: typed outcome `deliver-verified-candidate` (exit 0; in the retry action's expected outcomes) naming `git -C <root> push <remote> <verified>:<destination>` and stating the later commits keep their own route | `scripts/push-init.mjs` | `scripts/push-init.test.mjs`: three unit cases, the consumer-sequence anchor (real bare remote, real generated hook), negative pins |

## Trust assumption (stated, not hidden)

A local remote-tracking ref of the same remote name is taken as the record of what that remote holds (what a push or fetch wrote there). No network is used. A URL remote, an unconfigured remote name, an option-shaped remote and publication on another remote never pass. Release tags (strict `v<n>.<n>.<n>[-beta.<n>]` and anything starting `v<digit>`) are never relaxed, published or not. A tag matching a declared release-adapter trigger (or with an unreadable trigger declaration) keeps the full gate in guard-push; the generated hook never mirrored deploy gating and does not carry that carve-out (no test for the defensive carve-out; it only narrows the pass).

## push-init offer rules (no dead end, no circle)

Offered only when: the only failed check is `verify-evidence-bound` = `stale-commit`; the green `evidence/verify-latest.json` commit is an ancestor of HEAD; the push approval (tracked record with the private store laid over it, read as the hook reads it) names that commit and the destination; every commit between is handover-only or a consumed Critic export (one commit, one kind; a commit mixing both, a merge, or any code change keeps today's refusal); the verified commit is not already contained in `refs/remotes/<remote>/<branch>`. The command is run by the caller and judged by the gates; after it the offer is not repeated (anchor asserts this), the later commits keep their own route.

## Downstream sweep

- Outcome names (`chat-ready`, `signature-required`, `precondition-unmet`, `checkpoint-ready`): only `push-init.mjs` and its test consume them. `docs/push-release-flow.md`, its plugin copy and `skills/pipeline-start/references/push-approval.md` name the command but enumerate no outcomes: unaffected. A sentence about the new outcome in `docs/push-release-flow.md` is optional follow-up (out of scope).
- Hook refresh: `renderImpl` bytes changed, so `hook-currentness` reports the old install stale; the runtime snapshot enumerates the whole lib directory, so `lib/published-tag-push.mjs` is carried (N27a refresh case).
- Codex/Antigravity routes use the same `renderImpl` and the same lib module: no runner-specific code.

## Needs registration (out of scope)

`lib/published-tag-push.test.mjs` is not run by Verify until registered in `harness/scripts/verify.mjs` (TP-3) and `harness/config/verify-case-completion.v1.json`. The same predicate is also covered through the registered guard-push, hook-install and push-init suites.

## Method note

Tests were written before the production code but first executed after it; the RED evidence is the revert proof (production files reverted to the candidate, N27 cases fail).
