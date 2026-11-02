# w104 — the first consent names what is installed and activated, and the mandatory hooks follow the promotion (candidate 18)

Applies on the chain after w103. It edits `plugins/pipeline-core/skills/pipeline-start/SKILL.md`, `docs/operating-model.md` and `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`; the vendored plugin copy of the operating model is refreshed later by `generate-vendored-canon`.
PO decision of 2026-11-02: after the kickoff promotion the mandatory hooks are activated automatically, and the consent for that is the initial question "should this project use the Pipeline?", which must say what agreeing installs and activates.
Criterion binding: AC-145 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `SKILL.md`: the initial question now "lists in short what agreeing installs and activates, git hooks included"; the "One onboarding consent" scope sentence adds "after the promotion mandatory-hook activation (plus the runner's own refresh step)".
  The file sits at the 24 KiB pin, so three redundant phrases were dropped to make room (", including intake" in the scratch paragraph, one duplicate capture-failure sentence in step 7, "(additions, role variants → typed references)" and the trailing "Rerun preflight after the documented recovery.").
- `docs/operating-model.md`: the paragraph "Pipeline-use consent is likewise one bounded bootstrap consent" names the mandatory-git-hook provisioning/activation after the promotion and the runner's own host-boundary refresh step (at its declared boundary), and says the initial question discloses it so no second question follows.
- `project-onboarding-v3.mjs`: new exported `buildPostPromotionHookProvisioningAction({ rootDir })`. When a CLI command's output carries schema `pipeline.codex-onboarding-kickoff-promotion-apply.v1`, the output gains `postPromotionAction`:
  the existing `clone-hook-readiness.mjs --root <root> --apply` command, same expected result (`pipeline.mandatory-hook-readiness.v1`, `ready`), `mutation: true`, `requiresConfirmation: false` and `coveredByConsent: "initial-pipeline-use-consent"`. The action is only built, never run, here.

## Checks (in the slice clone, one suite at a time)

- Criterion cases written first and RED against the original code (2 of 2 failed), GREEN after the edit (2 of 2): the action shape/flags and the three wording anchors.
- `project-onboarding-v3-argv-closure.test.mjs` 42 of 42; `bootstrap-payload-budget.test.mjs` 10 of 10; `pipeline-start-v3.test.mjs` 8 of 8 (it was red at 24,815 bytes before the trims); `greenfield-machine-output-and-skill-budget.test.mjs` 15 of 15; `bootstrap-payload-measure.test.mjs` 5 of 5.

## Not changed / not proven

- No `pipeline-start-preflight.mjs`, `clone-hook-readiness.mjs`, consent gate or INTAKE code change; the action, its digest binding and its refusals are the existing ones. No widening beyond hook provisioning/activation and the runner's disclosed refresh.
- Only the direct promotion result (the `bootstrap-bind-apply` path) carries the action. `kickoff-promote-apply` returns the shared v4 inspection shape, whose post-promotion status vocabulary was not changed, so it does not carry it yet.
- The `postPromotionAction` wiring inside `main()` was not exercised end to end; only the builder is tested. The full Verify run was not made.
- Open follow-up (the PO decision is only partly met by this patch): the post-promotion action reaches the agent only on the direct promotion result; `kickoff-promote-apply` has to carry it too, which needs a decision about its post-promotion status vocabulary and a look at `pipeline-start-preflight.mjs` (outside this slice's write set).

## Verification by the Elephant (2026-11-02)

The two criterion cases the Goldfish kept in a scratch probe now live in `project-onboarding-v3-argv-closure.test.mjs` (a third file in the patch, 44 of 44 there; the wording assertion was restated from "short list" to the trimmed text "lists in short what agreeing installs and activates" and "git hooks", the same statement). Run one at a time in the slice clone: `onboarding-continuity.test.mjs` 324 of 324, `check-consumer-safe-paths.test.mjs` 9 of 9; the budget and SKILL pin suites are as the Goldfish reported them. The patch applies to the repository root (`git apply --check` exit 0).
