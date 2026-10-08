---
schema: pipeline.backlog-item.v1
id: pipeline.gh-delivery-classifier-is-not-wired
type: workflow-improvement
owner: elephant
status: open
created: 2026-10-08
source: "Critic record pr-s1-full.md PR-F3"
sprint: alfred
done_when: manual
due: before the 0.7.0 candidate is called complete
---

# gh delivery classifier is not wired

## Description

`plugins/pipeline-core/lib/gh-cmd.mjs` is not called by the push guard or by any `commandIsGitPush` caller.
The classifier exists but guards nothing.

## Triggering situation

Critic record `pr-s1-full.md` finding PR-F3.

## Affected artifact

`plugins/pipeline-core/lib/gh-cmd.mjs` and the push guard. The wiring touches protected guard files, so it
lands in tranche 2 of the signed quality package.

## Proposal

Wire the classifier into the push guard. Acceptance: a `gh pr merge` in a ready session is refused by the guard.
Owner: Elephant. Due: before the 0.7.0 candidate is called complete.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** an unwired classifier is a false assurance.
- **Assignment (if accepted):** tranche 2 of the signed quality package.
- **Date:** 2026-10-08
