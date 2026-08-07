# Wave 6 body-slicing plan — CYB-2I (cross-call-site integration) + CYB-1h (drift-detection suite)

> Status: DRAFT — presented for PO/Elephant resolution of the open items in
> §3 before any briefing is written or any dispatch happens, per the
> universal package rule (`cyb-2-body-slicing.md` §4: "a plan approved
> before dispatch"). No code written yet. This document exists because
> `cyb-2-body-slicing.md` §3 item 1 flagged CYB-2I as "cannot be briefed
> precisely yet... a real but bounded design task for CYB-2I's own briefing
> once Wave 4/5 (2E/2F) land" — Wave 5 (CYB-2F) landed 2026-07-30
> (`a54a060`/`8dd7839`/`79e04f8`/`b77b03f`, Critic-reviewed, all findings
> dispositioned; see `docs/state.md`), so this wave is now unblocked to plan.

## 0. Why CYB-2I needs its own body-slicing (like CYB-2 did, unlike CYB-1)

CYB-2I's single stated AC (AC8) reads as one line — "Push/PR/Close/Release
consume the same completeness evaluator" — but investigation (this session,
Explore-agent, read-only) found it is actually **five separable pieces of
work touching five different files/subsystems with no shared code today**:

1. The "same evaluator function" AC8 requires **does not exist yet as a
   reusable, importable thing.** `guard-push.mjs`'s `checkSecurityEvidenceV2`
   (lines 1325–1443) is a **private, non-exported function local to that hook
   file**. It reuses the real shared primitives
   (`evaluateAllCapabilities`/`aggregateVerdict`/`validateSecurityEvidenceV2`
   from `security-evidence-evaluator.mjs`), but the surrounding orchestration
   — read the two v2 evidence files, bind to a commit/tree, reconcile
   persisted vs. recomputed outcomes, produce failure-line diagnostics — is
   NOT factored out. PR/Close/Release cannot `import` it today. Without
   extracting this first, any of the other three call sites would have to
   either duplicate that orchestration (violating AC8's own "no parallel
   duplicate evaluator" clause) or half-wire only the lower-level
   `security-evidence-evaluator.mjs` primitives directly, which is a weaker,
   inconsistent integration than Push's.
2. PR (`harness/scripts/check-pr-contributor-gates.mjs`), Close
   (a NEW `close.pre` hook script; the mechanism itself already exists and is
   in live use in this repo's own `.claude/pipeline.json`), and Release (a NEW
   call into `plugins/pipeline-core/scripts/release-version-plan.mjs`'s
   pre-mutation flow — no existing hook-list to register into, unlike Close)
   are three structurally different integration shapes, not one repeated
   pattern: an existing script to extend, a hook-list registration, and a
   brand-new call site with no precedent. Bundling all three into one dispatch
   would be exactly the "small/interlinked exception" EL-16 forbids — they are
   parallel-safe (no cross-imports between them) once the shared helper from
   (1) exists, and each is independently regression-risky in its own file.
3. AC13 (doc-lint for six status terms) and AC14 (CI network-isolation job)
   are independent of the call-site wiring entirely — AC13 is pure
   documentation + a lint script; AC14 is CI/test-infrastructure. Both can run
   in parallel with everything else in this wave.

CYB-1h (deferred from CYB-1, rides along in this wave per
`cyb-2-body-slicing.md` line 64) turns out to have its own unresolved design
question (§3 item 3 below) that must be settled before it can be briefed at
all — it is not simply "write a drift-detection suite."

## 1. Sub-packages

| ID | AC | Scope | Depends on | Notes |
|---|---|---|---|---|
| **CYB-2I-0** — extract the shared completeness-gate module | AC8 (foundation) | New exported module (e.g. `plugins/pipeline-core/lib/security-completeness-gate.mjs`) factoring `checkSecurityEvidenceV2`'s orchestration (evidence read, commit/tree binding, reconciliation, failure-line diagnostics) out of `guard-push.mjs` into a function parameterized by project dir + evidence relative paths + commit/tree, reusing the existing `security-evidence-evaluator.mjs` exports unchanged. `guard-push.mjs` refactored to call the extracted function with its own existing arguments — **zero behavior change**, `guard-push.test.mjs`/`guard-push-v2.test.mjs` must stay byte-identical in outcome (98/99 / 9/9, same failing case). | none (CYB-2F already landed) | **Serialize, first, isolated — same risk class as CYB-2F itself.** Touches `guard-push.mjs`, the highest-risk file in the whole epic per CYB-2F's own scope note. Mandatory full `guard-push.test.mjs` + `guard-push-v2.test.mjs` regression; TP-5-protected files are read-only to the dispatched agent (no test-fixture edits without a separate PO test-path lift). Nothing else in this wave's call-site work (2I-1/2/3) should start before this lands, or they will each hand-roll their own copy of exactly the thing AC8 forbids duplicating. |
| **CYB-2I-1** — PR call site | AC8 (PR) | Extend `harness/scripts/check-pr-contributor-gates.mjs`'s `validatePrContributorGates()` to also invoke CYB-2I-0's shared gate against the PR's head commit/tree, adding a new `errors[]` code on a blocking completeness verdict; extend the receipt schema version if the shape changes; integration test asserting the same shared function is invoked (not a duplicate). | CYB-2I-0 | Parallel-safe relative to 2I-2/2I-3 (no cross-imports). Existing file has a clean `{ok, errors[]}` contract already — additive, not a rewrite. |
| **CYB-2I-2** — Close call site | AC8 (Close) | New `close.pre` hook script (own file, e.g. `plugins/pipeline-core/scripts/check-close-security-completeness.mjs`, matching the existing two `close.pre` scripts' shape: no CLI args, plain exit-code contract) invoking CYB-2I-0's shared gate; registered as a new entry in this repo's own `.claude/pipeline.json` `ritualExtensions.close.pre` array (after the two existing entries); integration test. | CYB-2I-0 | Parallel-safe relative to 2I-1/2I-3. The extension mechanism itself is already live and documented (`close-block/SKILL.md` lines 30–42) — this is registering into an existing list, not inventing a new mechanism, lower risk than 2I-3. |
| **CYB-2I-3** — Release call site | AC8 (Release) | New call gating entry into `createReleaseVersionPlan()`'s pre-mutation flow (or between decision and plan construction — exact insertion point is this sub-package's own design decision, see open item below) in `plugins/pipeline-core/scripts/release-version-plan.mjs`, invoking CYB-2I-0's shared gate against the sealed plan's bound candidate commit/tree; integration test. | CYB-2I-0 | Parallel-safe relative to 2I-1/2I-2, but **highest design latitude of the three call sites** — no existing hook-list or extension point to register into (unlike Close), so this sub-package must decide the concrete insertion point itself, not just wire into a named slot. Reserve for `goldfish-deep`, not `goldfish-implementor`. |
| **CYB-2I-4** — AC13 doc-lint (six status terms) | AC13 | Define the six-term vocabulary (`clean/complete/unavailable/unsupported/waived/not-applicable`) as one coherent, mutually-exclusive taxonomy — reconciling the existing `CONTROL_RESULTS` 7-member enum (`met, not-met, not-applicable, unavailable, waived, unknown, invalid`) and v1's loose `candidate.status === "clean"` usage — in a doc (likely `guardrails/security.md` or a new small glossary section), then a lint/generated-from-schema check enforcing no doc conflates `unavailable` with `not-applicable`. | none | Parallel-safe with everything else in this wave — no code dependency on 2I-0. **Genuinely greenfield** (no prior doc defines this vocabulary at all) — flag as a real authoring task, not a tightening of an existing definition. |
| **CYB-2I-5** — AC14 CI network-isolation job | AC14 | CI job (or extension of an existing workflow) asserting the full offline conformance suite (fake adapters only, from CYB-2A's fixture matrix) makes zero outbound network calls; concrete mechanism (e.g. a network-sandboxed runner step, or an assertion wrapper around the test run) is this sub-package's own design decision. | CYB-2A (fixture matrix, closed) | Parallel-safe with everything else. Needs a quick survey of existing `.github/workflows/*.yml` for a reusable network-isolation pattern before scoping precisely (not yet investigated this session). |
| **CYB-1h** — drift-detection verify suite (deferred from CYB-1) | CYB-1's AC14 | New verify suite failing when catalog schema/module precedence/receipt binding (CYB-1a/1b/1c/1e/1g's actual files: `control-catalog-schema.mjs`, `reference-catalog.mjs`/`control-catalog-migration.mjs`, `security-policy-resolver.mjs`, `control-waiver-lifecycle.mjs`) is edited without its paired `.test.mjs` fixture also changing. **Cannot be briefed precisely until the open item below is resolved.** | Open item below | Independent of CYB-2I entirely; rides along in this wave only because both were deferred to "Wave 6" by the original CYB-2 body-slicing plan. |

## 2. Dependency graph and dispatch order

```
Wave 6a:  CYB-2I-0                                          (foundation: extract shared gate; same
                                                              seriousness as CYB-2F; nothing else in
                                                              this wave's call-site work starts first)
Wave 6b:  CYB-2I-1   CYB-2I-2   CYB-2I-3   CYB-2I-4   CYB-2I-5   CYB-1h*
          (needs 2I-0)  (needs 2I-0)  (needs 2I-0)   (no dep)    (no dep)   (*needs open item resolved)
```

CYB-2I-4/2I-5/CYB-1h do not depend on CYB-2I-0 and could in principle start
immediately — sequencing them into "6b" alongside the call-site work is a
convenience grouping, not a hard dependency; PO may choose to run them
earlier in parallel with 6a if throughput matters more than one clean
foundation-first story.

## 3. Open items requiring PO/Elephant resolution before full dispatch-readiness

1. **CYB-2I-0's exact exported shape is a real design decision, not a
   mechanical extraction.** The current `checkSecurityEvidenceV2` closes over
   several outer-scope values it does not take as parameters
   (`sourceCommit`, a `readEvidence()` closure bound to `evidenceProjectDir`,
   hard-coded relative evidence paths). Turning this into a clean, reusable
   export means deciding its parameter shape once, for all four future
   callers — get this wrong and PR/Close/Release each end up working around
   an awkward API instead of a genuine shared function. Recommend: dispatch
   as `goldfish-deep` (design latitude, guardrail-adjacent file), not
   `goldfish-implementor`.
2. **CYB-2I-3 (Release) has no existing extension point to register into**,
   unlike Close's live `close.pre` mechanism — its own briefing must decide
   the concrete insertion point (before `createReleaseVersionPlan`, between
   decision and plan, or elsewhere) as part of the task, which is a bigger ask
   than "add a call here." Flagging so it isn't silently assumed to be as
   simple as CYB-2I-2.
3. **RESOLVED (PO decision, 2026-07-30):** CYB-1h's own spec line
   ("registered via CYB-2's scoped-registration mechanism") described
   something that doesn't exist the way it's worded — the actual
   `scoped-verify-registration` mechanism
   (`plugins/pipeline-core/lib/scoped-verify-registration.mjs`,
   `SCOPED_VERIFY_REGISTRATION_TASK_ID = "pipeline.verify-gate-scoped-registration"`)
   is a Sentinel-epic artifact, hard-pinned by sha256 to
   `specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md` specifically,
   with a frozen 3-entry suite allowlist unrelated to CYB-2. CYB-2's own new
   suites so far (e.g. `guard-push-v2-tests`, this session) were registered
   as plain `TEST_SUITES` entries in `verify.mjs`, NOT through this scoped
   mechanism — there is no distinct "CYB-2 scoped-registration mechanism".
   **PO chose option (b): register CYB-1h's suite as a plain `TEST_SUITES`
   entry**, like the rest of CYB-2's suites, treating the original epic
   wording as stale/aspirational rather than a binding requirement. CYB-1h
   can now be briefed precisely on this basis.
4. **CYB-2I-5's concrete CI mechanism is not yet scoped** — needs a quick
   survey of `.github/workflows/*.yml` for an existing network-isolation
   pattern (or confirmation none exists) before its briefing can be written
   precisely. Not investigated this session; flag as the one remaining
   factual gap before Wave 6b's briefings are all dispatch-ready.

## 4. What this plan does NOT do

It does not write any briefing yet, and it does not choose sub-package (3)'s
PO decision on the PO's behalf. Per the same universal package rule CYB-2's
own body-slicing plan named: this document is the plan; briefings for
CYB-2I-0 through CYB-2I-5 can be drafted once presented, and CYB-1h's
briefing waits specifically on open item 3 above.
