# w116 — the draft inspection refuses an uncovered design scope before the PO signs (candidate 19, C18-12 follow-up)

Base `28060444a` plus w115; applies to the repository on its own (`git apply --check` exit 0). Binding: AC-241 as for w91; the PRD and the Spec are unchanged.

## What it changes

- `lib/architecture-design.mjs`: the scope-coverage rule of `inspectArchitectureDesign` moves into one helper, `requireScopeCoverage(input, planPath, taskScope)`, called from both places. `inspectArchitectureDesignDraft` (the read-only check before a plan is presented or submitted) now runs it too and returns the same typed detail (`field`, `expected`, `rejectedValue`) as the approved inspection. The code, the covered paths and the bounded list (6 entries, 96 characters) are exactly the ones w91 introduced. The draft passes `null` as task scope: the task scope is the plan path, which is already in the required list.
- `lib/architecture-design.test.mjs`: one new case. It is RED against the original code (the draft returned `ok: true` for a scope missing `architecture/map/index.md`, `architecture/fitness-model.json`, `architecture/baseline.json`) and GREEN with the change; a fully covering scope still passes the draft.

## Why

C18-12: a readiness reviewer advised a wrong scope, the PO signed, and `materialize-architecture` refused afterwards; a second signature was needed. w91 made the refusal name the missing paths. Moving the same check to the draft means the refusal comes before the first signature. This replaces the `materialize-architecture --plan` dry-run mode that w91 listed as a follow-up: no new CLI mode is needed because the draft inspection already runs at `present-plan`/`submit-plan`.

## Checks (slice clone)

- `architecture-design.test.mjs` 19 of 19 (18 before).
- Same file with the original code and the new test: 18 of 19, the new case RED.
- `brownfield-implementation-entry-demands-a-greenfield-design-block` 16 of 16; the six pins that build design blocks (`entry-gates-greenfield-pending`, `consumer-approved-plan-reaches-the-first-item-host-commit`, `configure-verify-output-lacks-a-walkable-commit-route`, `claude-background-goldfish-is-host-committed-at-subagent-stop`, `three-runner-happy-path-with-two-po-approvals`, `configure-verify-names-the-unmet-approval-condition`, `greenfield-implementation-entry-with-pending-verification-surfaces`) 75 pass, 1 skipped, 0 fail; `push-init` and `codex-pretool-guard` green.

## Not changed / not proven

- A repository whose draft already carries a too-narrow scope was accepted at the draft before and is refused now. That is intended (it would have been refused at implementation entry anyway), but any fixture of that shape in a suite not run here would turn red. `project-onboarding-e2e` and `pipeline-state` were not run in the slice clone.
- The full Verify run was not made.
