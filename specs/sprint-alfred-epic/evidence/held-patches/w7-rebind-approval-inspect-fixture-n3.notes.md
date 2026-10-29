# W7 rebind-approval inspect fixture (N3) - BLOCKED, no patch

Slice: W7-REBIND-APPROVAL-INSPECT-FIXTURE-N3-C1-20261027. Candidate e9e76880d8598306f1d122dead7b75ca668d5e22.
Outcome: checkpoint (stop condition 3: the case needs production code, which this slice forbids). No `.patch` was written because no test-file change can make the case honestly green.

## Finding (re-verified against the repository tree, read-only)

The case `inspect of an approval that cannot be verified on this checkout lists rebind-approval alongside reopen-design` in `plugins/pipeline-core/scripts/rebind-approval.test.mjs` has two preconditions, and the second one is a production gap, not a fixture gap.

1. Reaching the ready branch is fixture work (large, not the blocker). `readyLifecycleResult` in `plugins/pipeline-core/lib/project-onboarding-v3.mjs` (around line 4007) returns `status: "ready"` with `nextAction: planLifecycleInspectAction(...) ?? designToImplementationHandoverAction(root, fs)` only after the clone passes the whole onboarding observation chain (repository, runtime, continuity, app-server, PO-authority rebind/decision checks above line 3898). The throwaway clone fails earlier with `partial_authority` (lines 5331 and 5645). Making it onboarded needs a full onboarded project fixture, plus an architecture-design invalid/drift state with a code in `ARCHITECTURE_DESIGN_REOPEN_CODES` so `designToImplementationHandoverAction` (line 3334) returns `reopenDesignAction()` (line 3386). That is a sizeable, unproven fixture and I did not build it.
2. `rebind-approval` is never offered by onboarding inspect. `rg` for `rebind-approval`/`rebindApproval` in `plugins/pipeline-core/lib/project-onboarding-v3.mjs` returns no match. `designToImplementationHandoverAction` only builds `reopenDesignAction` (`PO_AUTHORITY_REBIND_WRITER` with `reopen-design`), `materialize-architecture`, `architecture-design-required`, and set-phase actions. The only producers of a `rebind-approval` argv are `plugins/pipeline-core/lib/design-readiness-host-evidence.mjs` (line 62, `deviceLocalFindingForCode`) and `design-workflow-package-v2.mjs`, neither referenced from the onboarding module. The last assertions of the case (`verbs.includes("rebind-approval")`) would therefore stay red even with a perfect ready fixture.

## Exact missing seam

Production change in `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: `designToImplementationHandoverAction` (or its caller) must publish a command action whose `argv[1]` is `rebind-approval` next to `reopen-design` (Ruling 58, R75_INSPECT, spec section 22.5). Outside this slice's write scope.

## Not done

- No clone or clone2 created, no RED/GREEN run, no whole-file counts taken (baseline recorded earlier by the recon note: 10 tests, 9 pass, 0 fail, 1 todo; not re-measured).
- No test-file edit, no patch, no apply check. The `todo` option and `INSPECT_TODO` stay untouched (removing them would turn the suite red, which would weaken nothing but break the contract).
- Protected-path classification: the test file is not matched by TP-1..TP-13; the blocker is scope (production file), not a guard.
- Independent Critic review stays a parent-owned batch gate.

## Suggested follow-up

Split into (a) a production slice adding the `rebind-approval` offer to the handover/reopen action, with its own RED case, then (b) the onboarded-clone fixture slice. Proposed commit message once both exist: "test(approval): reach the ready inspect branch in the rebind-approval fixture so the todo case runs".
