# CYB-2 body-slicing plan — policy-complete verification (#42)

> **Status: DRAFT, design-phase, presented for PO plan-gate approval.**
> Nothing here is dispatch-eligible yet. Per `cyb-2-feature-spec.md` §8 and
> the epic's "same universal package rule": Full Verify + Security green,
> independent fresh Critic, THEN a PO gate — CYB-1's "Freigabe" closed CYB-1
> only, it did not open CYB-2's dispatch gate. This plan itself is the thing
> being gated: no Goldfish dispatch happens against it before an explicit PO
> "approved" on this document (or a named deviation).

## 0. Why CYB-2 is not sliced the way CYB-1 was

CYB-1 was greenfield: every sub-package created brand-new, disjoint files, so
Wave 3/4 parallel dispatch was safe by construction (no shared write
surface). CYB-2 is different in kind: it **migrates and extends existing,
already-tested production code** (four scanner adapters, the security-scan
aggregator, guard-push, toolchain-preflight). A current-state read of that
code (this session, 2026-07-25) surfaced a concrete high-coupling cluster:

- `harness/scripts/security-scan.mjs`, `plugins/pipeline-core/hooks/guard-push.mjs`,
  `guardrails/security.md`, and both scripts' own test files all hard-code
  the literal schema string `"pipeline.security-evidence.v1"` and the exact
  v1 field names (`candidate.status/commit/tree/inputSha256/...`,
  `policy.configurationSha256/sha256`, `payloadSha256`, `snapshot.method`).
  **Any evidence-schema version bump touches all of these simultaneously.**
  This is the single biggest shared-write-surface risk in CYB-2 and must be
  serialized, not parallel-dispatched.
- The four adapters (`gitleaks.mjs`, `osv-scanner.mjs`, `semgrep.mjs`,
  `license-check.mjs`) are mutually independent of each other (no
  cross-imports) and share an identical external contract
  (`{status, classification, findings, raw, reason}`) that
  `security-scan.mjs` consumes. They are genuinely parallel-safe **relative
  to each other**, but each migration must preserve (or explicitly version)
  that external contract, since `security-scan.mjs` is a live consumer.
- `plugins/pipeline-core/scripts/toolchain-preflight.mjs` is largely
  independent — it shares only the *concept* of scanner names/config keys
  with `security-scan.mjs`, not code or schema, except for the shared
  `security-readiness/tool-identity.mjs` trust-resolution module both use.
- `guard-push.mjs` (1277 lines) is the largest, most dense, most
  push-gating-critical file in the migration surface. It currently has NO
  "plan"/"plan-completeness" concept at all — only evidence-freshness +
  approval-state + deploy-trigger gating. Extending it is high-risk and
  must be its own isolated, fully-regression-tested slice, last in sequence.
- **AC8's "Push/PR/Close/Release consume the same completeness evaluator"
  names four call sites, but only one (`guard-push.mjs`) currently exists as
  an identifiable hook file** in `plugins/pipeline-core/hooks/`. No
  dedicated PR/Close/Release guard file was found in this session's
  investigation. **This is an open unknown, not a silent assumption** — CYB-2I
  (below) is scoped to investigate and, if the other three call sites don't
  exist as distinct enforcement points yet, that itself is a finding for the
  PO/Elephant to resolve before CYB-2I can be briefed precisely, not
  something to guess into a briefing now.

## 1. Sub-packages

| Sub-package | AC(s) | Scope | Depends on | Parallel-safe? |
| --- | --- | --- | --- | --- |
| **CYB-2A** — fixture matrix (foundation) | AC12 (+ scaffolds AC1-3,6,7,9-11) | All 15 failure-class fixtures from spec §4 (all-pass, blocking+non-blocking, all-skipped, one-required-skipped, optional-skipped, empty/stale rule pack, unsupported language, environment execution failure, timeout/cancellation, partial/truncated coverage, malformed output, version/config/policy drift, changed candidate after planning, cross-platform tool resolution), written to FAIL meaningfully against a stub/absent evaluator first, per spec §5's "negative gates first" | CYB-1F (frozen `cap.*`/control-result vocabulary only) | **Foundation — nothing else starts before this exists**, analogous to CYB-1a |
| **CYB-2B** — `security-evidence.v2` schema + L3 evaluator core | AC1, AC2, AC4, AC5, AC6 | The 10-state run-outcome enum (`pass, findings, required-capability-missing, unsupported, execution-unavailable, partial-coverage, stale, invalid, not-applicable, waived` — already cross-referenced and F-3-ratified by CYB-1F §7) as a NEW schema version; pure evaluator function collapsing CYB-2A's fixtures from failing to passing one at a time | CYB-2A (fixtures first), CYB-1F (F-3 mapping, already ratified) | New schema/module — additive, but is itself the thing every other slice depends on; effectively a second foundation layer |
| **CYB-2C** — L2 plan builder | scope carried (§5), supports AC1/AC9 | New module: deterministic required-capability plan from CYB-1b's `resolveApplicableControls()` output; plan digest joins candidate evidence | CYB-1b (closed), CYB-2B (schema alignment) | Parallel-safe (new file) once 2B lands |
| **CYB-2D** — adapter contract v2 migration (4 files) | scope carried (§5) | `gitleaks.mjs`, `osv-scanner.mjs`, `semgrep.mjs`, `license-check.mjs` each gain capability-contract fields (capability IDs, supported ecosystems, versions, offline/network behavior, required inputs, severity/confidence normalization, coverage/limitations, exit mapping, timeout/cancellation, evidence fields) | CYB-2B (v2 contract target) | Parallel-safe **across the 4 files relative to each other** (no cross-imports) — but each is a migration of live production code consumed by `security-scan.mjs`; worktree isolation should be confirmed/used for this wave given real regression risk, unlike CYB-1's brand-new-file waves |
| **CYB-2E** — `security-scan.mjs` v2 integration | AC1-9 (aggregation) | Wire CYB-2B's evaluator + CYB-2D's migrated adapters into the aggregator; extend/replace v1 evidence emission with v2 (dual-emit during the compatibility window per PRD deviation D9) | CYB-2B, CYB-2D | **Serialize — do not run alongside 2D or 2F.** Touches the highest-coupling file cluster named in §0 |
| **CYB-2F** — guard-push plan-completeness extension | AC1, AC8 (partial), AC10 (interaction) | Extend `guard-push.mjs` to consult CYB-2C's plan + CYB-2E's v2 evidence for push-time completeness gating | CYB-2C, CYB-2E | **Serialize, last, isolated.** Highest-risk file in the whole package (1277 lines, push-gating-critical); mandatory full `guard-push.test.mjs` regression, no concurrent edits |
| **CYB-2G** — read-only preflight extension | AC10 | Extend `toolchain-preflight.mjs` with new capability-completeness probes; must remain zero-mutation (assert empty before/after diff) | CYB-1F (cap IDs), CYB-2D only if `security-readiness/tool-identity.mjs` itself changes | Parallel-safe relative to 2E/2F (shares only `tool-identity.mjs`, not the evidence-schema cluster) — confirm no concurrent `tool-identity.mjs` edit before dispatching alongside 2D |
| **CYB-2H** — v0/v1→v2 migration fixture | AC11 | Fixture: a v1 evidence record evaluated under v2 policy is rejected/insufficient, never silently accepted as complete (note: investigation found no live v0 file in use — v1 is the actual current baseline being superseded, correcting `security-scan.mjs`'s own header-comment lineage claim) | CYB-2B | Parallel-safe (new fixture file), can run alongside 2C |
| **CYB-2I** — cross-call-site single-evaluator integration (AC8) + CI network-isolation (AC14) + doc-lint (AC13) | AC8, AC13, AC14 | Investigate what "Push/PR/Close/Release" call sites concretely are today (only `guard-push.mjs` confirmed to exist as a hook); integration test(s) asserting one evaluator function is invoked at each real call site found; offline conformance-suite CI job; doc-lint for the six status terms | CYB-2E, CYB-2F (needs the call sites to exist first) | **Cannot be briefed precisely yet — scope depends on CYB-2E/2F's actual integration shape and on resolving the PR/Close/Release call-site unknown.** Flag to PO/Elephant before this sub-package gets its own briefing |
| **CYB-1h** (deferred from CYB-1) — drift-detection verify suite | CYB-1's AC14 | New verify suite failing when catalog schema/module precedence/receipt binding is edited without a matching fixture update, registered via CYB-2's scoped-registration mechanism | CYB-2's scoped-registration mechanism (part of CYB-2E/2G's verify-wiring) | Rides along once CYB-2's own verify-registration lands; closes CYB-1's last AC retroactively |

## 2. Dependency graph and dispatch waves

```
Wave 1:  CYB-2A                                            (foundation: fixture matrix, fails-first)
Wave 2:  CYB-2B                                            (needs 2A; schema + evaluator core)
Wave 3:  CYB-2C          CYB-2D(x4, worktree-isolated)   CYB-2H   CYB-2G   (each needs 2B; 2D internally
                                                                            parallel across its 4 files,
                                                                            worktree isolation recommended;
                                                                            2G only if no concurrent
                                                                            tool-identity.mjs edit)
Wave 4:  CYB-2E                                            (needs 2B+2D; serialize, no concurrent
                                                             touch of security-scan.mjs/guard-push.mjs
                                                             /guardrails/security.md)
Wave 5:  CYB-2F                                            (needs 2C+2E; serialize, isolated, last)
Wave 6:  CYB-2I + CYB-1h                                   (needs 2E+2F; scope-investigation gate first)
```

Unlike CYB-1's Waves 3/4, **Wave 3's CYB-2D is NOT a "run all four in the
same main checkout" pattern** — each of the four adapter files is existing
production code with its own test file and a live consumer
(`security-scan.mjs`); worktree isolation per `.claude/pipeline.json`'s
`"worktree": "optional"` setting should be used for this wave specifically,
confirmed at actual dispatch time, to avoid interleaved edits to files that
already have production behavior and regression coverage (a stricter bar
than CYB-1's brand-new-file waves needed).

## 3. Open items requiring PO/Elephant resolution before full dispatch-readiness

1. **AC8 call-site unknown (CYB-2I):** only `guard-push.mjs` was found as a
   concrete "Push" enforcement point; "PR/Close/Release" call sites were not
   located as distinct guard files in this session's investigation. Before
   CYB-2I can be briefed, the Elephant needs to either locate them (they may
   live outside `plugins/pipeline-core/hooks/`, e.g. in CI workflow files or
   the close-ritual skill) or get a PO/spec clarification on what these four
   call sites concretely are in this repo's current architecture.
2. **CYB-2B/2E schema evolution vs. the "compatibility window" (PRD deviation
   D9):** the feature-spec names a dual-emit compatibility window ending "on
   first L1 policy adoption, reviewed at sprint close" — this plan defers the
   exact mechanics of that window to CYB-2E's own briefing rather than
   deciding it here; flagging so it isn't silently assumed away.
3. **Fixture-matrix ownership (CYB-2A) vs. evaluator (CYB-2B) as two
   foundational layers rather than one:** this plan splits what CYB-1 would
   have treated as a single "1a-equivalent" into two sequential foundation
   waves (fixtures-fail-first, then the evaluator that flips them green) per
   spec §5's explicit "negative gates first" instruction. This is a genuine
   design choice being surfaced for approval, not an established precedent
   from CYB-1.

## 4. What this plan does NOT do

It does not write any briefing yet. Per the advisor consultation this
session: CYB-1's "Freigabe" resolved CYB-1's own package-close gate only;
CYB-2's own spec §8 requires the epic-level PO gate's relevant open
decisions to be resolved (done — F-3 ratified, decisions A-E and CYB-1F
F-1..F-5 all resolved per `docs/state.md`) AND, per the universal package
rule, its own plan approved before dispatch. This document is that plan,
submitted for approval now.
