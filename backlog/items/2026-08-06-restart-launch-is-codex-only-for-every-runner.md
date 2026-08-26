---
schema: pipeline.backlog-item.v1
id: pipeline.restart-launch-is-codex-only-for-every-runner
type: defect
owner: pipeline
status: closed
created: 2026-08-06
source: "Manual re-run of the empty-directory onboarding smoke test in scratch/onboarding-smoke-test while re-verifying backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md (see backlog/evidence/2026-08-06-onboarding-runner-identity-reverification.md), 2026-08-06."
due: 2026-09-05
expires: 2026-09-05
closed_at: 2026-08-08
closure_repository: self
closure_commit: 864c7f1f84b5e0a874e360bf26e168fa92f14aaf
closure_evidence: backlog/evidence/2026-08-08-restart-barrier-runner-exemption-verification.md
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

- **Decision:** accept-open.
- **Rationale:** the item's own two open questions (is
  `codex-onboarding-launch.mjs` actually runner-generic in effect, and does
  a live Claude session ever reach this `nextAction`) are unanswered and
  should be answered before any fix is designed — this is exactly the class
  of issue the item's own "Attempt 1" caution warns against fixing on
  naming alone. Not investigated further this session; no new evidence
  changes the item's own assessment.
- **Assignment (if accepted):** pair with
  `backlog/items/2026-08-07-onboarding-ready-path-unconditional-restart-barrier-read.md`
  (filed the same sprint, adjacent runner-neutrality gap in the same
  ready/restart machinery) — investigate both together, they may share a
  root cause or a fix.
- **Date:** 2026-08-07

## Closure, 2026-08-08 — both open questions answered, fixed by `864c7f1`

This item declined to propose a fix until its two open questions were answered.
They now are, and the answer to the first is why the fix took the shape it did.

- **"Is `codex-onboarding-launch.mjs` actually runner-generic in effect, or does
  a Claude consumer end up running Codex-specific host-readback logic?"** Neither.
  It is Codex-specific *and* unreachable-by-design for a tool call, so a Claude
  consumer following the instruction could not run it at all. Its declared target
  set is frozen to `.codex/*` and it clears only through a ticket proving a fresh
  Codex process re-read those bytes. The naming was not stale wording; it was
  accurate, and the instruction pointing a Claude session at it was the defect.
- **"Does a live Claude session ever actually reach this `nextAction`?"** Yes —
  three independent live repros, recorded in the sibling item.

Fixed by `864c7f1f84b5e0a874e360bf26e168fa92f14aaf` (dispatch RUNAUT-1). A runner
that reads none of the barrier's targets no longer gets a barrier at all
(`plugins/pipeline-core/lib/project-onboarding-v3.mjs:3809`), and `restartAction`
branches on the runner rather than naming the Codex launcher unconditionally
(`:1572`). `LAUNCH_SCRIPT` in `guard-lifecycle-ready.mjs` still names only the
Codex launcher, which is now correct rather than incomplete: it is the only
launcher there is, and it is only ever offered to the runner it belongs to.

Verified independently by the orchestrator at both line numbers; suites green on
the current tip (`project-onboarding-v3` 107/0, `guard-lifecycle-ready` 51/0,
`codex-onboarding-runtime` 19/0). The paired item named in the triage
assignment, `2026-08-07-onboarding-ready-path-unconditional-restart-barrier-read.md`,
is not closed by this and keeps its own status.

**Update 2026-08-18 (Elephant, Phoenix backlog-clearing pass):** at the time
of this pass, the item still read unfixed on the Phoenix line —
`guard-lifecycle-ready.mjs`'s `LAUNCH_SCRIPT` names only
`codex-onboarding-launch.mjs`, and `project-onboarding-v3.mjs` still builds
the Codex launcher argv and Codex-worded diagnostic unconditionally there.
Nova has since built exactly the runner-aware fix this item's open questions
were blocking: `restartAction()` (Nova `project-onboarding-v3.mjs` ~line 1983)
branches `if (runner !== "codex") return externalOperatorRestartAction(runner)`,
with a code comment explicitly cross-referencing this backlog item's name —
i.e. Nova already answered both open questions by building the runner-aware
path rather than investigating the old one further (see the `864c7f1f`
closure above, which independently reaches the same conclusion with line
numbers and suite evidence). Per PO direction (2026-08-18): items already
resolved in Nova's current code are closed here rather than reimplemented.
Confirms the closure above.

## Update, 2026-08-07 (second live session)

A second onboarding test (`rune_test1_claude` line of work, same day) reached
this same territory in a genuinely live session using `--runner claude`
throughout, and the returned restart `nextAction` still named
`codex-onboarding-launch.mjs` — partial evidence toward this item's own open
question "does a live Claude Code session ever actually reach this
`nextAction` in practice?" (above). This is still a static reading of the
returned JSON, not an executed restart (the process-exiting launch itself was
not run, same caution as the original finding) — the other open question,
whether `codex-onboarding-launch.mjs` is actually runner-generic in effect,
remains unanswered. Full detail, including the precise unrelated guard-grammar
trap hit on the way there, is in the sibling item
`backlog/items/2026-08-07-onboarding-restart-flow-is-codex-only-not-runner-aware.md`
("Additional evidence, 2026-08-07" section).
