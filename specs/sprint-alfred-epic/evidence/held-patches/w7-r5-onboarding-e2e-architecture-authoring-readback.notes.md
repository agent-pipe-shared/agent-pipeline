# W7-R5 greenfield e2e: the driver now stops at design authoring before the architecture authoring readback

Slice W7-R5-ONBOARDING-E2E-ARCHITECTURE-AUTHORING-READBACK-20261031. Targeted delivery: green. The patch changes ONE file,
`plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs` (no production file). It is cut against the candidate in the
prepared clones (HEAD 9271f387a plus the fifteen candidate-13 patches, fd384f974) and applies after them (`git apply --check`
exit 0, driver `patch` mode). Batch Critic, final Verify and PO acceptance stay pending.

## Decision: (a) deliberate contract, case restated; no production change

Deciding commit: **5e939278b** ("bind lifecycle input and qualify controlled refusal paths", 2026-10-25). It introduced
`stagingDesignNeedsAuthoring` (`lib/design-authoring.mjs`), the `design-authoring-required` action returned by
`intake-generate-apply` (and by the lifecycle inspect as `bootstrap-binding-required` / `design-authoring-required`,
`project-onboarding-v3.mjs`) and `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED` ("author the generated PRD and Spec before binding their bytes").
The contract is stated and pinned in four sibling places that already carry the commit name: `codex-pretool-guard.test.mjs`
(QG-04 note: "architecture-design-required is published only for an already APPROVED PRD"), `onboarding-continuity.test.mjs`,
`project-onboarding-v3.test.mjs` ("design-authoring-required", `completeGeneratedStagingDraft`) and the R4 case 92 restatement.
Nothing regressed: the driver stops exactly where the lifecycle says to, for all three runners.

Why the stop moved: no pipeline-state exists and no feature is bound until the bind runs, and the bind planner refuses unauthored
staging bytes. So the pipeline-state `inspect` that published `repair-required` / `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE` is simply
not reached by the returned driver chain until the PRD and Spec have been authored.

## Restated case (names its intent; nothing weakened, skipped or deleted; no `test(` added or removed)

"in-process driver follows returned actions and preserves the Codex legacy-advisory approval boundary", every runner (codex, claude,
antigravity) in the case's loop:

1. After the design answers the returned driver stops (`unsupported-next-action`) with the generator's
   `design-authoring-required` action (schema `pipeline.onboarding-intake-generate-apply.v1`, `mutation:false`,
   `requiresConfirmation:false`, prdPath/specPath equal to the generated targets); no submit-plan, present-plan or approve-plan step ran.
2. Inspecting again returns the lifecycle form of the same stop (`bootstrap-binding-required`, same kind and paths).
3. Nothing exists yet: `readPipelineState` is `{status:"absent"}` (no submission, presentation, signature request or bound feature).
4. The untouched generated PRD and Spec are the staging draft (`stagingDesignNeedsAuthoring` true), `planOnboardingBootstrapBind`
   refuses them with `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`, both files stay byte-identical and the state stays absent.
   (This replaces the old "submit-plan rejects the untouched reserved architecture draft" probe, which needs a bound feature.)
5. First authoring pass at the stop: the Spec's skeleton criterion and traceability rows (now table rows) get a real AC-1 and a real
   trace row, the PRD's Spec digest moves to those bytes, the draft banner leaves the PRD and the architecture block's prose fields
   (responsibility, rationale, profileId) are written. One reserved value (`nonResponsibilities`) is deliberately left: the staging
   gate is only a read-only draft signal over the prose fields (`stagingDesignNeedsAuthoring` is false), the architecture parser
   (`parseArchitectureDesign`, architecture-design.mjs:64) remains the authority for the rest.
6. The continued driver binds and reaches the case's ORIGINAL assertions unchanged: `unsupported-next-action`, nextAction
   `{repair-required, ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE}`, `final.status` draft, `planApproved` false, lifecycle
   `{ok:true, code:"PLAN-LIFECYCLE-CURRENT", status:"draft"}`, no early submission/presentation/signature, canonical state names the PRD.
7. `submit-plan` rejects the unfinished draft with `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE` (status 2, records nothing, PRD
   unchanged); removing the block gives `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED` as before.
8. The final authoring (full architecture block, ADR dir, review receipt, five-source commit, one signed approval, Codex legacy advisory
   boundary, drift/receipt-stale probes, implementation entry) is untouched. The only change there: the Spec criterion replacement
   moved to step 5, and a pin asserts the Spec on disk is that authored text with the PRD digest bound to it.

Which fields each gate reads (the load-bearing fact of step 5): `stagingDesignNeedsAuthoring` (design-authoring.mjs) reads only the
draft banner, the `responsibility` / `rationale` / `profileId` JSON values that start with `REPLACE: `, the traceability table rows and the
generated criterion placeholder. `parseArchitectureDesign` (architecture-design.mjs:61-64) walks EVERY string in the block
(`containsPlaceholder`, `startsWith("REPLACE:")`), so `nonResponsibilities: ["REPLACE: ..."]` passes the first and fails the second.
The generation byte check of the old probe is kept in step 4: `stripGeneratedArchitectureTemplate(untouched PRD, {required:true})`
proves the exact reserved template is published once and that removing only it leaves the generated Spec digest intact.

Dropped in the restatement, with the reason: only the word "untouched" on the submit-plan probe (step 7 now probes the
authored-but-unfinished draft with the same code); the untouched draft is covered by step 4 at the gate that actually sees it first.

## Evidence (finished logs in scratch/agent-out/w7r5, machine-written by the driver)

- Red before the edit (`red0.project-onboarding-e2e.test.mjs.log`, clone, original test): the one case fails (deepStrictEqual of the
  readback: `design-authoring-required` instead of `repair-required` / `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE`).
  `base1.project-onboarding-e2e.test.mjs.log` (clone2, no change) fails the same single case: 5 pass, 1 fail, 1 skipped.
- Green after: `c1.project-onboarding-e2e.test.mjs.log` 7 tests, 6 pass, 0 fail, 1 skipped (the pre-existing `test.skip`); the codex, claude
  and antigravity loop iterations each print "returned-action architecture authoring and one signed final design approval passed".
  Repeat run `c1rep.project-onboarding-e2e.test.mjs.log`: 6 pass, 0 fail, 1 skipped (stability).
- `c1.onboarding-init.test.mjs.log`: 58 pass, 0 fail; `base1`: 58 pass, 0 fail.
- `c1.check-verify-case-completion.test.mjs.log`: 32 pass, 0 fail; `base1`: 32 pass, 0 fail. No `test(` was added or removed, so no
  pinned count moved.
- `c1.project-onboarding-v3.test.mjs.log`: "240 cases across 2 sequential chunks of 6 shards, 2 shards failed"; the failing names are exactly
  the R3 STOP pair (the seeded push gate; SECGATE-1). `base1` lists the same two names, identical set.
- Revert proof: no production file changed, so there is nothing for the driver's `revert` mode to revert. The test-side proof is the
  unchanged-code run of the original case (`red0`, `base1`: red) against the restated case on the same code (`c1`: green).

## Architecture line bound (coordinator correction, budget grant resumed)

The first cut left `project-onboarding-e2e.test.mjs` at 1818 lines, past its accepted 1801 in `architecture/boundary-policy.json`
(over-line-bound; the precedent 7d4c6ecf0 splits, never raises the ratchet). Re-cut: the file is now **1796 lines** with no assertion
removed: only explanatory comments were condensed and a few multi-line assertion messages were joined onto one line. The grant
carried budget only, so the suggested new sibling fixture module and any boundary-policy ownership edit stayed out of scope and were
not needed; the bound is met inside the briefed write scope. The ratchet and the policy file are untouched.
- `scratch/agent-out/boundary-diff.mjs clone2 clone`: base 103 violations, cand 103 violations, no ONLY CAND line.
- Re-run on the final state (logs `c2.*`): e2e 7 tests, 6 pass, 0 fail, 1 pre-existing skip; architecture-boundary-check.test 9 pass
  0 fail; onboarding-init.test 58 pass 0 fail; check-verify-case-completion.test 32 pass 0 fail. The full onboarding-v3 suite
  (c1 log above) ran before the comment/format-only trim; the trim touches only the e2e test file, which that suite does not load.
- Patch re-cut: 21898 bytes, one file, `git apply --check` exit 0 on the candidate.

## Open follow-up (two drifted callers, same cause as this slice: 5e939278b)

- `plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs:147` still expects an onboarding round resolved as
  `authored-architecture-design` with code `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE`.
- `plugins/pipeline-core/scripts/measure-fresh-repo-onboarding-turns.mjs:489` handles only `architecture-design-required` and has no
  `design-authoring-required` branch.
Both are outside this slice and were not run; they need their own slice.

## Downstream sweep

No production file changed, so there is no changed function to sweep; the three runners are covered by the case's own loop.

## Not changed / open

- `plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs:147` still expects an onboarding round resolved as
  `authored-architecture-design` with code `ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE`, and
  `plugins/pipeline-core/scripts/measure-fresh-repo-onboarding-turns.mjs` (line 489) handles only `architecture-design-required` and has no
  `design-authoring-required` branch. Both are the same drift reached through 5e939278b; they are outside this slice's write scope and
  were not run here. They need their own slice.
- The R3 STOP pair (seeded push gate; SECGATE-1) stays red and is outside this slice, as do guard-push-v2, guard-push-scratch-advisory
  and guard-gate-strength GST33.
- The "Spec is a table now" fact: the old fixture replaced a legacy `- AC-01:` bullet that the generator no longer emits; the restated
  fixture replaces the table rows from `renderDesignTraceabilitySkeleton`.
