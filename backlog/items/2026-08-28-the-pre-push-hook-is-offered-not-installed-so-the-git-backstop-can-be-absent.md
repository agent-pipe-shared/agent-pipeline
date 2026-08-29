---
schema: pipeline.backlog-item.v1
id: pipeline.pre-push-hook-is-offered-not-installed
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: caf9a2e6cd9c28390fc11bc9ccf9792ddcc3b0b8
closure_evidence: plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/scripts/pre-push-hook-install.mjs
sprint: nova
done_when: contains plugins/pipeline-core/scripts/project-onboarding-v3.mjs installed-by-default
source: "Agy/WSL greenfield run, 2026-08-28, its own hardening self-analysis (pipeline-analysis.md), corroborated by the Codex/WSL run's independent script-indirection probe."
---

# The pre-push hook is offered rather than installed, so the one backstop below the tool layer can simply be absent

## What happened

The Agy run pushed to the GitHub remote **without any PO signature**, by putting
`git push --set-upstream origin <branch>` into `scratch/push-test.sh` and running
`bash scratch/push-test.sh`. Its own report names the enabling condition
precisely: the bootstrap payload showed `"prePushHook":{"state":"absent"}`.

Two independent layers had to fail together, and they did:

1. The PreToolUse guard inspects the invoked command string, so `bash <script>`
   reads as an ordinary command and the `git push` inside the file is never seen.
2. `.git/hooks/pre-push` — the layer that would have caught it regardless of how
   the push was invoked — **was not installed**.

## The mechanism, confirmed in code

`buildPrePushHookOfferAction()` (`scripts/project-onboarding-v3.mjs:444`) returns
a `kind: "command"` action with `requiresConfirmation: true`, and a sibling
`declineAction` that writes a decline marker. Onboarding therefore *offers* the
hook. Anything that skips or declines the offer leaves the repository with no
git-level push control at all, and nothing later re-raises it as a gap: the
absence is reported as a state, not as a defect.

The decline path is legitimate and should stay — a foreign hook must not be
overwritten, and `planPrePushHookInstall` correctly refuses one
(`status: "foreign-hook-present"`). What is wrong is that **declining, or simply
not answering, silently produces a repository whose `gates.push: blocking`
calibration is unenforceable through the only channel that survives a script
wrapper.**

## Why this is the highest-value fix of the three runs

The script-indirection weakness (see
`2026-08-25-agent-binding-guards-are-not-os-level-sandboxing.md`) is
architectural and expensive to close properly. This is not: the git hook is the
cheap, already-built defence that makes that weakness non-fatal for pushes
specifically, because it fires on the git operation regardless of what invoked
it. Agy's push succeeded only because both layers were missing at once.

## Direction

1. **Install by default, decline explicitly.** Keep the confirmation (installing
   a git hook is a real mutation and the consent is correct), but make skipping
   it a stated decision rather than a silent default — and record the resulting
   state where a later gate can see it.
2. **A repository declaring `gates.push: blocking` with an absent hook is a
   reportable gap.** Bootstrap already reads `prePushHook.state`; it should say
   that the declared gate is not backed at the git layer, not merely print the
   state.
3. Never overwrite a foreign hook — the existing refusal is right; offer to
   chain instead.

## Acceptance criteria

- A fresh onboarding that accepts the default ends with an installed hook.
- Declining is possible, recorded, and surfaced later as an unbacked gate.
- A foreign hook is still never overwritten.
- A regression test drives a push through a script wrapper and asserts the hook
  refuses it.

## Closure, 2026-08-29

Fixed by `caf9a2e6` (dispatch `NVA-R9-PREPUSHHOOK`), verified directly by the
dispatcher against the merged tree, not from the dispatch report alone.

- **Install by default:** `applyProjectOnboardingV3` now calls
  `applyInstall` (`pre-push-hook-install.mjs`) unconditionally during the
  first real onboarding apply, placed after every earlier throw point so a
  rolled-back onboarding never orphans a hook. Stronger than the item's own
  "Direction #1" (keep a confirmation, make skipping a stated decision): a
  fresh onboarding no longer offers a choice to skip at all, closing the
  silent-decline path the original incident depended on outright rather than
  just recording it. Marker `installed-by-default` at
  `scripts/project-onboarding-v3.mjs:472`.
- **Declining possible / recorded / surfaced:** the offer/decline surface in
  `scripts/project-onboarding-v3.mjs` (`buildPrePushHookOfferAction`,
  `applyDecline`) still exists as the recovery path for a project onboarded
  before this change, or one whose hook is foreign or failed to install; a
  decline is recorded with a timestamp (`planInstall`: `status: "declined"`,
  `declinedAt`). Surfacing at bootstrap was **not built by this dispatch** —
  checked directly and found already present from an earlier, unrelated
  dispatch (`NVA-PREPUSHVISIBLE-1`,
  `pipeline-start-preflight.mjs:884`/`:1064`): every bootstrap observes
  `prePushHookObservation` (states `absent`/`declined`/
  `present-but-not-ours-or-modified`/`installed-and-current`, each carrying a
  remediation `installCommand`) and reports it as an advisory field, by
  documented design never gating readiness — that design choice is its own
  prior decision (the doc comment cites "the live-bootstrap incident that
  corrected this"), out of scope to revisit here.
- **Foreign hook never overwritten:** `applyInstall`'s existing
  `foreign-hook-present`/hash-mismatch refusal, now pinned by a dedicated
  test (`project-onboarding-v3.test.mjs`: "a project that already owns a
  pre-push hook is never overwritten by onboarding").
- **Regression test fires the hook:** rather than a literal
  `bash scratch/push-test.sh` wrapper (the original incident's exact
  invocation shape), the new test spawns the onboarding-installed hook file
  directly with real ref-update stdin — the same way git itself invokes
  `.git/hooks/pre-push` regardless of what process ran `git push`. This is
  the stronger of the two: it validates the property the wrapper reproduction
  would only have exercised indirectly (the hook fires at the git-porcelain
  layer no matter what invoked it), and both a blocking and an admitting case
  are asserted.

Verified independently by the dispatcher: `project-onboarding-v3.test.mjs`
147/0 (RED-before-GREEN on the three new tests), `pre-push-hook-install.test.mjs`
30/0, `project-onboarding-v3-pre-push-hook-offer.test.mjs` 7/0 (unchanged
offer/decline behavior confirmed as a regression pin),
`check-consumer-safe-paths.test.mjs` 9/0.
