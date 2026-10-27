# Recon: pipeline.brownfield-architecture-gate-never-passes (P0, stage 25)

Source: read-only Explore agent, 2026-10-27. Model output; cited lines re-verifiable. Snapshot row text: snapshot.json lines 7598-7633.

## Cause status per sub-finding
- D1 FIXED (883d14c84, D165-D1): entry-gates.mjs:157-230 `architectureFitnessAuthorityVerdict` no longer denies on class 10 unavailable. Tests entry-gates-greenfield-pending.test.mjs:174-210, architecture-entry-readiness.test.mjs:458.
- D2 FIXED partly (D165-S3, 1bcce7add, `withClass9RequiredScope`); open question hand-written map vs measured baseline unresolved.
- D3 FIXED for propose/status/check/prepare/measure/fitness (D165-S1); materialize-architecture and Phoenix wrapper tracked in pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers.
- D4 OPEN: hurdles surface only at `set-phase implementation`, after the PO signs the plan. Patch d165-s4-submit-plan-precheck.patch (precheck in pipeline-state.mjs submit-plan) is HELD, not applied; turns ten fixture suites red; scope decision pending; pipeline-state.test.mjs has a pre-existing abort at prepareCalibrationArchitectureFixture.
- D5 FIXED (D165-S2).
- D8: architecture-effective-decisions.mjs:85-86 lstat(docs/adr) ENOENT -> ARCH-DECISION-SOURCE-UNAVAILABLE.

## Covered by D179
D179 covers only D8 (a separate P1 item: missing docs/adr). Held patch, not applied. 3 cases in lib/architecture-effective-decisions.test.mjs, RED 15/16, GREEN 16/16.

## Remainder
1. D4 (S4 held, scope decision pending - PO/parent decision on ten red fixtures).
2. No end-to-end brownfield reproduction (measure, approved-scoped adoption, guard verdict); consumer's regression-test idea unbuilt.
3. native-host, verify-wsl, critic, po-acceptance are non-agent owners.

## Minimal slice (single Goldfish dispatch)
- New case(s) appended to plugins/pipeline-core/lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs (alt host: lib/guard/entry-gates-greenfield-pending.test.mjs). No production edit.
- Cases RED-first: (a) temp brownfield fixture (approved-scoped adoption with scope union, map present, docs/adr present, class 10 unavailable) -> `architectureFitnessAuthorityVerdict` null and readiness ready; (b) same without docs/adr: blocked ARCH-DECISION-APPLICABILITY-BLOCKED until D179 applied -> skip or pin as current behaviour; (c) class 9 inputs missing from scope still deny.
- Write scope: that test file + held-patch .patch/.notes.md. 25-32 calls. D4 wiring exceeds 35 and needs the PO scope decision.

## Risks
- entry-gates.mjs and pipeline-state.mjs are kernel/guard paths: operator apply, --no-verify commit, stamp, install.
- D179 touches a gate component; independent Critic batch review parent-owned.
- Do not assert stage 75 without native-host qualification.

## Runner-neutrality
Shared lib/guard modules, plain node:test, no runner hook assumptions; symlink cases skip without symlink rights (as D179).

## Can the row reach 75 with D179 alone?
No. Needs D4 applied (or explicit PO scope decision) plus the end-to-end regression, D179 as companion.

## Recommendation
Held patch YES for the end-to-end regression (apply D179 first). Do not bundle D4 without the PO's S4 scope decision.
