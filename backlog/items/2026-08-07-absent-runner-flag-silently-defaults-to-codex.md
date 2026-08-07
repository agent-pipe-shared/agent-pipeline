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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
