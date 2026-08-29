---
schema: pipeline.backlog-item.v1
id: pipeline.pre-push-hook-is-offered-not-installed
type: defect
owner: pipeline
status: open
created: 2026-08-28
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
