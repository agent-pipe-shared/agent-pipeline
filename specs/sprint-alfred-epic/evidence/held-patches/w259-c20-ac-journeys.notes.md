# W259 held patch: acceptance criteria are examined as whole user journeys and state transitions

Dispatch C20-G2027-AC-JOURNEYS. Candidate 20 finding G20-27 (Codex greenfield report, P0 row "Produktfehler und unzureichende Examiner").
Closest criterion AC-108 (PRD and Spec unchanged). Targeted delivery: see the status line at the end; batch Critic, full Verify and PO
acceptance pending. Held patch: `w259-c20-ac-journeys.patch` (a `git diff --binary` of the clone chain, against 35db88a31e6d8c28770b6b78825aec3793b4b902);
the chain is not applied in the repository, so a plain `apply --check` on the repository fails by design. Nothing under plugins/ was edited in the repository.

## What

- New pure reading `plugins/pipeline-core/lib/spec-journey-coverage.mjs` (`inspectSpecJourneys`, `JOURNEY_REPAIR`, `JOURNEY_CLASSES`): per normative
  criterion row of a Spec (the host parser `scanAcceptedCriterionRows`), `covered` / `not-covered` / `not-user-facing`. A user-facing criterion names its
  journeys (`Journeys:` clause) and the actual effect asserted (`Asserts:` clause); an effect that only says "text changed" or "updated", an empty clause
  and a skeleton placeholder (`<...>`, `REPLACE`) do not count. `[user-facing]` forces the duty, `[not user-facing: <reason>]` exempts, a tag without a
  reason exempts nothing. Without a tag a criterion is user-facing by a small closed English vocabulary (user, player, screen, page, button, click, tap,
  press, browser, dialog, menu, reload, display, render, UI).
- Readiness: `lib/plan-handoff-readiness.mjs` gains the typed code `PLR-HANDOFF-NO-JOURNEY` (after the criterion scan, before the check paths). The message
  names every criterion and what it lacks; the existing refusal text appends the repair (add the two clauses or tag the criterion). It is raised at
  submit-plan and present-plan only (never at approval), for governed projects, exactly like the other hand-off codes.
- Spec template `templates/spec.md`: a hard rule, the AC-1 example with the clauses, and a section "Journeys and state transitions" listing the classes
  (every entry path, reload in the middle of a transition, a second action after an error, a concurrent import, every dynamic text context).
- Test authorship: `templates/prompts/goldfish-task.md` field 3 and the generated briefing (`lib/dispatch-briefing-build.mjs` test-first block) carry
  a "Journey coverage" duty; the Critic template `templates/prompts/critic-review.md` Phase A item 1 checks journey coverage per criterion and makes a
  missing journey a finding. Vendored copies regenerated (`generate-vendored-canon.mjs`).
- `agents/readiness-reviewer.md`, `skills/pipeline-start/references/kickoff-design.md` and `intake-generate-design.md` state the bar.
- Close readback `lib/close-quality-readback.mjs`: sixth row `journey-coverage` (appended, the five original ids keep order and shape). Evidence lists
  `AC-n: covered` / `AC-n: not covered (no journeys, no effect)` per user-facing criterion; present / missing (with the repair) / not-applicable
  (no user-facing criterion) / unknown (Spec unreadable). `scripts/close-coordinator.mjs` passes the Spec path the plan was bound to. The close chain
  guide already turns a missing row into an agent action.
- Pin `lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs` (8 cases, RED 7 fail / 1 pass before the production edits).

## Why

Green unit tests missed stored-HTML execution, play without a timer, an overwrite after an import with the same revision and the loss of the rescue
candidate: each criterion was examined as a unit. The duty is now stated where a Spec is written (template), checked where it is gated (plan hand-off),
carried into test authorship and review (briefing, Critic) and reported at close (per-criterion row). Runner neutral: pure library, templates and
agent text only; no runner-specific code path.

## Changed existing cases (QG-04, restated in place with a comment, nothing weakened)

- `scripts/close-coordinator.test.mjs` "AC-239 drive and --dry-run ...": the readback id list and the audit-index row count (5) gain the appended
  `journey-coverage` row (6); the five original ids keep their order.
- `lib/close-quality-readback.test.mjs` "AC-239: exactly the five ids ...": the id list gains the appended `journey-coverage`; "every row present" is
  asserted for the five original rows and the new row is asserted `unknown` (the fixture has no Spec reader).
- `scripts/project-onboarding-e2e.test.mjs`: the example criterion text and test path are unchanged; the clauses `Journeys:` / `Asserts:` were added
  because the criterion mentions a player and the hand-off now refuses a user-facing criterion without them.

## Not changed

- `PRD`, `Spec`, signed design-package and approval payload formats: the hand-off verdict is only consulted for refuse / proceed, so no signed or
  digested field changed.
- `lib/path-spelling.mjs`, the separator-sweep sites, `harness/verify-suites.json`, the inventory: the new pin needs registration in the Verify
  suite list by the Coordinator.
- The `scripts/project-onboarding-v3-argv-closure.test.mjs` example criterion (same wording, but that suite stays green without the clauses).
- A "work-verify" per-criterion surface: no such row surface was found; the close readback is the reporting site. A separate work-verify report
  would be a follow-up.

## Not proven

- `scripts/pipeline-state.test.mjs` and `hooks/guard-lifecycle-ready.test.mjs` were not run (forbidden by the briefing); the former drives the same
  hand-off inspection with German fixtures that the English vocabulary does not match. The full Verify is the Coordinator's.
- `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs`: one case ("default-mode present-plan hands the PO exactly one sign-intent
  command") fails in the clone with "exactly one line names sign-intent ... 2 !== 1". Its output begins "Plan presentation recorded ...", so the
  hand-off ran and did not refuse; this change can only affect that test by refusing, so it is not caused by this change. Not re-run on a base clone.
- Consumer scaffold: the generated consumer Spec skeleton (`| AC-1 | WHEN <trigger>, the system SHALL <observable result>. | REPLACE: ... |`,
  `lib/design-authoring.mjs`) is deliberately unchanged: its text is matched by placeholder detectors, fixtures and about ten tests, so adding the
  clauses there is its own change. A consumer author's first contact is therefore the typed `PLR-HANDOFF-NO-JOURNEY` refusal with its repair.
- The full `scripts/close-coordinator.test.mjs` file was green (52 of 53) before the two restated assertions; after them only the one restated case
  was re-run alone (1 of 1).

Targeted delivery: green. Pin 8/8 (RED 7 fail / 1 pass before the edits); readback 11/11; dispatch-briefing 162/162; vendored-canon 8/8;
vendored-template-sync 4/4; doc-contracts 76/76; goldfish pins 7/7 and 6/6; skill-budget pin 15/15; onboarding e2e 6 pass / 1 skipped;
argv-closure 45/45; check test 3/3. Batch Critic, full Verify and PO acceptance pending; the new pin needs registration in the Verify suite list.
- The vocabulary is a heuristic: English only, so a Spec in another language tags user-facing criteria with `[user-facing]`; a criterion with a
  journey clause that names the wrong journeys is not judged (the Critic judges that).
