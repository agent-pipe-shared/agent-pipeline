# Design note: pull request as a second delivery mode (decision AN)

Status: options for the PO (non-blocking); implementation follows in 0.7.0 with its own test slices and a full Critic. Row AN (`specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md:46`): PR joins push with the same candidate binding and evidence; platform merge and artifact hand-off are refused as typed "unsupported", never silently allowed; the slice touches the push gate, so it is a signed package. Author: goldfish-deep, 2026-10-08. Nothing was run and no `gh` command was executed: "no rule" below means "none found by search", not "observed allowed".

## 1. Seams [D]

How the push gate binds a candidate today:
- `commandIsGitPush` (`plugins/pipeline-core/lib/git-cmd.mjs:1121`) is the one classifier: an allowlist anchored on a git word, with a fail-closed marker rule (:1123; header :1032-1120). `guard-push.mjs:350` runs the gate only when it returns true; the header (:1033-1035) names the Codex prefilter as the other caller.
- `approve-push` (`plugins/pipeline-core/scripts/pipeline-state.mjs:11332`) needs a safe remote and a destination matching `refs/heads/...` (:11392-11396), so tags and other refs are out of scope. The signed subject is `{sourceCommit, remote, destination, threatModel{path,sha256}}` (:11411, :11495; `plugins/pipeline-core/lib/critical-action-authorization.mjs:400-405`); the threat model is the fixed `project/push-threat-model.md` (:735).
- The record is `pushApproval.lastApproved = {approvedBy, approvedAt, forCommit, criticalProof, remote, destination, threatModel, humanApproval | criticalProofWaiver, decisionReference?, pendingAuditWrite}` (:11523-11541), one slot, overwritten by the next approval (:11545). A consumption entry `{proofSha256, kind:"push", consumedAt}` is written with it (:11548); replay is `CRITICAL-PROOF-REPLAY` (:11505-11506).
- The push is verified by `authorizeRecordedPush` (`critical-action-authorization.mjs:349`): `PUSH-PROOF-COMMIT-MISMATCH` (:386), `-BINDING-MISMATCH` for remote or destination (:387-389), `-THREAT-MODEL` (:393-396), the signature, `-NOT-CONSUMED` (:411-415). `guard-push.mjs:2412-2413` also compares `forCommit` with the source commit. An implicit destination fails as `PUSH-PROOF-INPUT-INVALID` (`docs/push-release-flow.md:493-503`).
- Approval kinds are enumerated at `plugins/pipeline-core/lib/critical-action-approval-request.mjs:23` (`push`, `deploy`, `publication`, `release-preflight`, ...). Nothing may be committed between `approve-push` and the push (`docs/push-release-flow.md:377-394`).

Where PR and merge are classified today:
- A `gh` command has no git word, so `commandIsGitPush` never selects it: the push gate does not run for `gh pr create`, `gh pr merge` or `gh api`.
- The only `gh` rule found admits two exact bare read-only shapes (`gh --version`, `gh auth status`) while the lifecycle is not ready (`plugins/pipeline-core/lib/guard/command-catalogue.mjs:452-459`); its comment lists `gh pr create` as falling through to `GUARD-LIFECYCLE-NOT-READY` (:448-450, pinned at `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:2754`). A search for `gh pr`, `pr create`, `pr merge` over `lib`, `hooks`, `scripts`, and for `gh release` / `gh api` over the four guard sources, found no other rule. So in a ready session no Pipeline-owned rule classifies a `gh` merge, and AN's "never silently allowed" is not true today.
- `git push` to a PR head branch is an ordinary push, except in the checkpoint lane: `refs/heads/feat/*` pushes carry no approval record (`docs/push-release-flow.md:90-117`). A PR can already be opened from a branch nobody approved. `gh release create` is likewise outside every guard and relies on a separate PO approval by convention (`docs/push-release-flow.md:598-608`).
- Decisive gap: the signed subject has no base ref. A signature for head `feat/x` says nothing about where the PR lands.

## 2. Options [C]

Common to all (slice 1): a `gh` classifier in a new lib (allowlist plus fail-closed marker rule in the style of git-cmd.mjs:1123), called from `guard-push.mjs` and from every other caller of `commandIsGitPush` (one source of truth, no partial copy). Proposed typed refusals:
- `DELIVERY-UNSUPPORTED-PLATFORM-MERGE`: `gh pr merge` (incl. `--auto`), `gh api` PUT on `pulls/*/merge`, GraphQL `mergePullRequest` / `enablePullRequestAutoMerge`.
- `DELIVERY-UNSUPPORTED-ARTIFACT-HANDOFF`: `gh release upload`, `gh gist create`, uploads to `uploads.github.com`. `gh release create` keeps its documented separate authority and is not reclassified here.
- `DELIVERY-UNSUPPORTED-API-MUTATION`: any other non-GET `gh api` call. `DELIVERY-UNSUPPORTED-PR-RETARGET`: `gh pr edit --base` (would move an approved PR). `DELIVERY-UNSUPPORTED-CROSS-REPO`: `--repo` or an `owner:branch` head.
- `DELIVERY-PR-BINDING-INCOMPLETE`: `gh pr create` without explicit `--head` and `--base` (same reason as the implicit-destination failure above). `DELIVERY-GH-UNCLASSIFIED`: a `gh` word with a marker (substitution, here-document to a shell, nested shell) the classifier cannot read.
- Read-only `gh pr view|list|status|checks|diff` stay unclassified.

**A. Same record, PR step added.** PR delivery = push of the candidate to the PR head under the existing `approve-push` record (destination = head ref), then `gh pr create --head H --base B` is admitted only if `authorizeRecordedPush(commit, remote, refs/heads/H)` passes. The guard classifies `gh pr create` as delivery; codes stay `PUSH-PROOF-*`. Gap: base B is unsigned; a configured base allowlist would be policy, not proof. Both acts share the one `lastApproved` slot. Cost: low; no new kind, no `pipeline-state.mjs` change.

**B. New record kind `pr-delivery` (recommended).** `approve-delivery --mode pr` (new `pipeline-state.mjs` subcommand) verifies a proof over `{sourceCommit, remote, head, base, threatModel}` and writes `deliveryApproval.lastApproved` in its own slot with its own consumption entry (`kind:"pr-delivery"`). Verifier `authorizeRecordedPrDelivery` mirrors :349-428 with `PR-PROOF-INPUT-INVALID | -RECORD-INCOMPLETE | -COMMIT-MISMATCH | -BINDING-MISMATCH (remote, head, base) | -THREAT-MODEL | -NOT-CONSUMED`. Guard: `gh pr create` needs a record whose commit, head and base match; a `git push` whose destination equals the record's head is admitted by either record; any other ref still needs a push approval. The PO signs once with the unchanged ceremony (`authorize-critical --kind pr-delivery`: copy, `approve`, passphrase). Cost: moderate; largest protected surface. Whether the new slot joins the `pendingAuditWrite` fold (`docs/push-release-flow.md:634-665`) is decided inside the slice.

**C. Session pushes, PO opens the PR.** The push gate stays as is; the guard adds the common refusals plus `DELIVERY-UNSUPPORTED-SESSION-PR` for `gh pr create`, and the session prints the `gh pr create` for the PO's terminal. Cost: low. It closes the silent-merge hole but does not make PR a mode: no PR binding or evidence beyond the push.

## 3. Signed-package slices

Protected paths (facts from `templates/prompts/agent-obligations.md` §2): TP-5 covers `plugins/pipeline-core/hooks/guard-push[-v2].test.mjs` and `harness/scripts/pipeline-state.test.mjs`; TP-9 `plugins/pipeline-core/lib/critical-human-proof-policy.test.mjs`; TP-4 `hooks.json`; TP-13 `harness/verify-suites.json`. New tests therefore go in new `*.test.mjs` files; registering them is one TP-13 signed ceremony, done once at the end. Source below is guardrail/security class (signed package per AN).
- Common (slice 1): new `plugins/pipeline-core/lib/gh-cmd.mjs` (name proposed), `plugins/pipeline-core/hooks/guard-push.mjs` call site (no new hook file, so no `hooks.json` change), the Codex prefilter caller of `commandIsGitPush` (path found with `git grep -n commandIsGitPush`, not read here).
- A: common plus a `gh pr create` branch in `guard-push.mjs`; no new kind.
- B: common plus `critical-action-approval-request.mjs:23` (kind), `critical-action-authorization.mjs` (new verifier), `critical-human-proof-policy.mjs` (kind policy; line 462 treats kinds without a source key specially, to be read in the slice), `pipeline-state.mjs` (subcommand, slot, schema), `po-human-approval.mjs` (confirmation text decoding head and base, per `docs/push-release-flow.md:202-206`), `docs/push-release-flow.md`, a new ADR.
- C: common plus docs.

Test-first order (red before code, one new file per slice):
1. `gh-cmd.test.mjs`: command table to class; each unsupported shape returns its typed code; `gh pr view` unclassified; marker cases fail closed; `gh pr create` without `--head`/`--base` returns `DELIVERY-PR-BINDING-INCOMPLETE`. Then wire into `guard-push.mjs`. Alone, this closes AN's "never silently allowed" half under every option.
2. (B) `pr-delivery-authorization.test.mjs`: commit, head and base mismatches each refused with their own code; unconsumed proof; replay; base swapped after signing refused.
3. (B) `guard-pr-delivery.test.mjs`: matching record admits `gh pr create`; a new commit makes it stale; push to the record's head admitted; push of another ref still needs a push approval.
4. Docs, ADR, `verify-suites.json` registration (TP-13).

## 4. PO choices (non-blocking)

1. Option B (recommended) / A / C. B because A leaves the base unsigned and C does not make PR a mode; slice 1 ships first whichever is chosen.
2. Draft PRs: recommended same approval (the diff is already published).
3. Fork and cross-repo PRs: recommended unsupported in 0.7.0.
4. One signature covering push of the head plus `gh pr create` (recommended, same commit, head and base); otherwise two ceremonies per delivery.
5. A PR from a `feat/*` checkpoint branch: recommended it still needs the `pr-delivery` record, since the missing approval is the point.
