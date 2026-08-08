---
schema: pipeline.backlog-item.v1
id: pipeline.absent-runner-flag-silently-defaults-to-codex
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "NOVA-RESTART-RUNNER-1 stop condition in the 2026-08-07 Nova session; the reverted change is recorded inline at the freshIntent default in plugins/pipeline-core/lib/project-onboarding-v3.mjs in commit 5efb0f1, carrying forward the question deferred by the closed item 2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md."
---

# An absent `--runner` silently resolves to Codex, and nobody has decided whether it should

## Description

Several internal helpers in `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
declare `runner = "codex"` as a parameter default — `freshIntent()` among
them. A caller that omits the flag therefore gets a Codex-shaped result with no
diagnostic, no warning, and no signal that an identity was assumed rather than
observed. Seeding that literal is the documented mechanism (ADR-0051/ADR-0057
R1) by which a Claude consumer once ended up with a Codex project.

Two prior attempts have now stopped at this same point, which is the reason to
raise it as its own decision rather than attach it to a third bounded fix.

## Triggering situation

`NOVA-RESTART-RUNNER-1` was briefed to correct these defaults to
`env.CLAUDECODE === "1" ? "claude" : "codex"`. It implemented the change, found
it breaks the existing, deliberately named regression test "omitting `--runner`
keeps the historical Codex App-Server requirement" plus roughly fifteen others
— because any session capable of running that suite is itself running under
Claude Code with `CLAUDECODE=1` — and reverted rather than force it through or
weaken the tests. The closed item
`2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md` had already
declined the identical change for the identical reason, calling it "its own
reviewed change".

The separate, narrower defect that dispatch was also given — `restartAction()`
offering the Codex launcher to a Claude session — was fixed and landed. This
item is only the remaining defaults question.

## Affected artifact

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — the `runner = "codex"`
  parameter defaults, and the inline note at `freshIntent()` recording the
  reverted attempt.
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` — the regression
  test "omitting `--runner` keeps the historical Codex App-Server requirement",
  which currently pins the behaviour under discussion.
- [ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)
  and [ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md)
  R1 — the runner-identity contract this default sits under.

## Proposal

Decide the intended contract explicitly and re-pin the test to whichever it is.
Three candidates, in the order they should be argued:

1. **Fail closed.** An absent `--runner` is a caller error; the helper raises
   rather than assuming. Safest, and the only option under which the observed
   failure mode (a Claude consumer silently getting a Codex project) becomes
   structurally impossible. Costs: every caller must be audited, and the
   existing regression test is inverted rather than adjusted.
2. **Keep `"codex"`, make the assumption visible.** Preserve today's behaviour
   but emit a typed diagnostic whenever the default is exercised, so an assumed
   identity is never indistinguishable from an observed one. Cheapest; leaves
   the trap in place but stops it being silent.
3. **Derive from the environment.** The reverted attempt. Note the test breakage
   was evidence about the tests' assumptions, not proof this option is wrong —
   but it does mean the option cannot be adopted without deciding what that
   regression test should assert instead.

Whichever is chosen, the deciding artifact should state why, since this is now
the second time the question has been reached and deferred. Do not adopt option
3 by simply re-running the reverted patch and updating whatever tests turn red.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept — **candidate 1, fail closed.** An absent `runner` is a
  caller error. The helpers raise a typed error rather than assuming an identity,
  and the regression test named above is deliberately inverted: omitting
  `--runner` becomes an error case, not a preserved historical behaviour.
- **Rationale:** three arguments, in the order they decide it.

  1. **The contract already exists in this module and says fail closed.** Commit
     `94b8a72` closed the sibling gap on the apply surface by making `runner` a
     required argument of `planBoundApplyAction()`, raising
     `APPLY-ACTION-RUNNER-REQUIRED` when it is absent. Choosing candidate 2 or 3
     here would leave two neighbouring surfaces of one module disagreeing about
     what an absent runner means. That is worse than either answer taken alone.
  2. **Candidate 3 mistakes one question for another.** Deriving the runner from
     `env.CLAUDECODE` answers "which runner is executing this process", but the
     parameter answers "which runner is this project for". Those coincide in a
     live session and diverge in every test run — which is exactly why the
     reverted attempt broke sixteen tests: the suite runs under Claude Code
     while exercising Codex-shaped projects. The breakage was not evidence about
     the tests' assumptions; it was evidence that the two questions are
     different. This is the reason to reject candidate 3 outright rather than
     defer it a third time.
  3. **Only candidate 1 makes the observed harm structurally impossible.**
     Candidate 2 keeps the trap and adds a diagnostic, which helps a reader of
     logs and not the consumer whose project was already created wrong. The
     observed failure — a Claude consumer silently receiving a Codex project —
     stops being reachable only when the assumption cannot be made at all.

  Cost, stated rather than discounted: every caller must be audited, and the
  regression test inverts rather than adjusts. That cost is the reason this
  question was deferred twice; it is not a reason to defer it a third time.
- **Assignment (if accepted):** a `goldfish-deep` dispatch, sequenced AFTER the
  runner-aware restart work lands — both change
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs` and must not run
  concurrently in one checkout. The dispatch audits every caller, threads an
  explicit runner from each, inverts the named regression test, and adds an
  enumerating check that fails when any helper in the module reintroduces a
  literal runner default.
- **Date:** 2026-08-08
