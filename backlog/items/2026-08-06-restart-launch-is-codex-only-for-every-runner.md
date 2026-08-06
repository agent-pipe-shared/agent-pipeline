---
schema: pipeline.backlog-item.v1
id: pipeline.restart-launch-is-codex-only-for-every-runner
type: defect
owner: pipeline
status: open
created: 2026-08-06
source: "Manual re-run of the empty-directory onboarding smoke test in scratch/onboarding-smoke-test while re-verifying backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md (see backlog/evidence/2026-08-06-onboarding-runner-identity-reverification.md), 2026-08-06."
---

# The `restart-required` step names Codex regardless of the active runner

## Description

Reaching `runtime.status: "restart-required"` for a `--runner claude` onboarding
chain still returns a diagnostic message that reads "Codex runtime targets
changed and require a fresh effective-runtime readback", and its
`nextAction.launch.argv` unconditionally invokes
`plugins/pipeline-core/scripts/codex-onboarding-launch.mjs` — a script that
imports `codex-project-runtime-readback-host.mjs`, i.e. a Codex host-specific
runtime readback flow — with no branch on the observed runner.
`guard-lifecycle-ready.mjs`'s `LAUNCH_SCRIPT` constant names only this one file
too, so the guard's restart-recognition path is equally Codex-named.

This is milder than the sibling defect already fixed in commit `c860e1d`
(runner identity flipping outright): here the reported `runner` field stays
correct (`"claude"`) throughout, but the message text and the launch target
are Codex-flavored regardless. Two open questions this item does not answer:

- Is `codex-onboarding-launch.mjs` actually runner-generic in effect (i.e. does
  it work correctly for a Claude project too, and the name/message are just
  stale wording), or does a Claude consumer following this instruction end up
  running Codex-specific host-readback logic that does not apply to them?
- Does a live Claude Code session ever actually reach this `nextAction` in
  practice, or does the `pipeline-start` skill's own restart handling
  intercept `restart-required` before a Claude consumer would see this text?

## Triggering situation

Manual re-run of the 2026-08-06 empty-directory smoke test, continuing past the
step the sibling item's fix covers, using `--runner claude --intent bootstrap`
end to end. Not executed to completion: the actual restart launch
(`requiresCurrentProcessExit: true`) was not run, since doing so would replace
the probing process. The finding is therefore reported from the returned JSON
and static reading of `codex-onboarding-launch.mjs`, not from an observed
failure.

## Affected artifact

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — the diagnostic
  message text and `nextAction.launch` construction for `restart-required`.
- `plugins/pipeline-core/scripts/codex-onboarding-launch.mjs` — the launcher
  itself, and whether it needs a runner-neutral counterpart or a runner branch.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` — `LAUNCH_SCRIPT`,
  which recognizes only this one script name.
- [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)
  — the runner-neutrality contract this is adjacent to.

## Proposal

Not worked out. First step is answering the two open questions above by
reading (or, in a follow-up session, executing) what the restart step actually
does for a Claude consumer before proposing a fix — the sibling item's
"Attempt 1" is a caution against fixing this class of issue without first
confirming the actual runtime behavior, not just the naming.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
