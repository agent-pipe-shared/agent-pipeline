---
schema: pipeline.backlog-item.v1
id: pipeline.remote-side-enforcement-is-the-last-instance
type: requirement
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
source: "Codex/WSL greenfield run, 2026-08-28 (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own observation that this runner needed three sessions and the most detours."
done_when: contains docs/push-release-flow.md NVA-LOCAL-VS-REMOTE-1
---

# Remote-side enforcement is the only push boundary a local bypass cannot reach, and it is not part of the model

## The argument

Every local control — the PreToolUse guard, the git hook, the approval artifacts
— lives on the machine the agent controls. The Agy run demonstrated the
consequence concretely: with the pre-push hook absent and the guard blind to
script contents, a push reached the GitHub remote with no PO signature at all.

The Codex run reaches the same conclusion from its own probes and states it as a
P0: "Lokale Git-Hooks sind keine belastbare Sicherheitsgrenze; sie können fehlen
oder umgangen werden."

## What this repository already knows

This is the same principle already recorded here: a guard cannot enforce its own
absence, and real blocking needs something outside the agent's reach. Branch
protection with a required status check is exactly such a control — and this
repository now has one configured, so the mechanism is understood and available.

## Direction

Make remote-side enforcement part of the delivered model rather than a local
convention:

- Branch protection with required checks on any branch the Pipeline pushes to.
- Signed commits or attestations verified server-side, not locally.
- Onboarding should state plainly which controls are local (bypassable by a
  determined local actor) and which are remote (not).

## Acceptance criteria

- The push-release flow documents the local/remote split explicitly.
- A consumer project's onboarding names remote enforcement as a prerequisite for
  the strict lane, rather than implying local gates are sufficient.
