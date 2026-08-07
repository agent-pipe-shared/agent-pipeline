---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-ready-path-unconditional-restart-barrier-read
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "ADR-0051 Follow-up section names this as one of two gaps to track as a dated backlog item; created per backlog/items/2026-08-05-adr-0051-follow-up-gaps-untracked.md's proposal, executed 2026-08-06 night autonomous backlog reconciliation."
due: 2026-09-06
---

# The onboarding ready path unconditionally reads a Codex-specific restart barrier

## Description

[ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)'s
Follow-up section names this gap explicitly: "the unconditional Codex-specific
restart-barrier read in `project-onboarding-v3.mjs`'s ready path." Confirmed
still present 2026-08-06: the ready-path code calls
`readRestartBarrier({ rootDir: legacy.root, ... })` unconditionally, with no
branch on the observed runner, so a fresh Claude-only project's ready-check
also reads a barrier concept that ADR-0051's own contract frames as
Codex-specific.

This is adjacent to, but distinct from, two other runner-neutrality gaps found
in the same area this sprint:
`backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`
(closed — the `plan*` CLI call sites dropping `--runner`/`--intent`) and
`backlog/items/2026-08-06-restart-launch-is-codex-only-for-every-runner.md`
(open — the `restart-required` step's launch target/message naming Codex).
This item is the third, `readRestartBarrier` itself, in the *ready* path
rather than the *plan*/*restart* paths the other two cover.

## Triggering situation

T1 Critic review finding F5 (2026-08-04/05) named this gap in ADR-0051's
Follow-up section but no backlog item was ever created for it; found
untracked by a later Critic review
(`backlog/items/2026-08-05-adr-0051-follow-up-gaps-untracked.md`, F5's own
follow-up finding). Created now, executing that item's own proposal.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs` (the ready-path
`readRestartBarrier` call site).

## Proposal

Not designed yet. First step: determine whether `readRestartBarrier` is
meaningfully Codex-specific (in which case a Claude-only ready check should
skip it or use a runner-neutral equivalent) or whether the barrier concept
already applies uniformly regardless of runner and only its *name*/doc
framing is Codex-flavored (in which case this may be a documentation-only
fix, similar in shape to the sibling restart-launch item). Read alongside
`backlog/items/2026-08-06-restart-launch-is-codex-only-for-every-runner.md`
before proposing a fix — the two may share a root cause or a fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
