# Closure evidence: the bootstrap language question had no code path to land its answer

- **Fix commits:**
  - `485613cfd9d336ee8c6d9abed63aa5e84892ff07` (GF-066, goldfish) — gives
    `kickoff plan`/`kickoff apply` a real, required `--language <de|en>` CLI
    parameter, enforced exactly like `--goal`; threads it through
    `planProjectOnboardingKickoffV4`/`applyProjectOnboardingKickoffV4` into
    `buildOnboardingKickoffPlan`, which resolves the explicit value (falling
    back to the historical file-read derivation only when no explicit value
    is supplied, for backward compatibility); binds the resolved language into
    the plan's own digest and into the PRD's `po-language` marker and
    `continuity.runtime.humanFacingLanguage`, exactly as the item's "Direction"
    section asked.
  - `929bfb4b123f3ceffc39ecb1afddd0dce83e784f` (GF-066, goldfish) — updates
    five pre-existing `project-onboarding-v3.test.mjs` CLI fixtures that
    omitted `--language`, now structurally required.
- **Independent verification (Elephant, this session):** this fix was
  originally dispatched, truncated mid-run (a stale 5-parameter call site to
  `applyAction()` inside `validatePlan()`'s own re-derivation, left over from
  before the function's signature grew to 6 params), diagnosed by re-running
  the affected suites directly and reading the failure
  (`APPLY-ACTION-RUNNER-REQUIRED`), resumed with a purely procedural message,
  and re-verified clean: both `onboarding-continuity.test.mjs` (131 passed)
  and `project-onboarding-v3.test.mjs` (113 passed) re-run directly, 0
  failures.
- **Why this matters, restated from the item:** before this fix, the document
  language had no parameter anywhere in the onboarding-through-kickoff call
  chain — the only way a human's real language choice could land was
  reactively, via a `PO-GATE-PRD-LANGUAGE-MISMATCH` refusal after the fact.
  `--language` is now a live, required kickoff input exactly like `--goal`,
  removing that reactive-repair class going forward.
- No separate Critic review dispatched for this fix at the time; it was
  treated as bounded implementation work (CLI parameter threading with an
  existing validated enum, not new guardrail/security surface) and
  self-verified per the standing practice for non-A/G/S diffs. Noted here
  for completeness rather than re-litigated now that the follow-on
  document-language decoupling work
  (`2026-08-09-decouple-hosted-project-document-language-from-operator-facing-language.md`)
  builds directly on top of this fix's plumbing.
