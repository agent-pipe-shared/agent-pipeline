# Sprint Alfred — Comprehensive Execution Roadmap & Plan

## 1. Executive Summary

Sprint Alfred delivers mechanical governance, control integrity, measurable rigor (C1 interruption receipts & telemetry), and agent-first architecture capability (ADR continuity, module inventory, fitness enforcement, adoption demand).

- **Current Status:** Workspace is **ready**, clean candidate established (`f0bbc84f3`), full verify baseline running under Node `v24.15.0`.
- **Scope Authority:** PRD (`specs/sprint-alfred-epic/prd_sprint-alfred-epic.md`), Technical Spec (`specs/sprint-alfred-epic/spec.md`), and ADR-0043.
- **Open Backlog Items:** 19 items across Tracks A, B, C, and D.
- **Delivery Strategy:** Subagent dispatches (Goldfish for implementation, Critic for adversarial reviews), strict verification before claim, single unified release without intermediate partial tags.

---

## 2. Track Breakdown & Open Backlog Item Mapping

### Track A — Enforcement Ground Truth & Control Integrity
| Work Package | Deliverables & Backlog Items | Key Mechanisms & Files |
|---|---|---|
| **A1** | Enforcement Conformance Probe | `plugins/pipeline-core/scripts/enforcement-conformance.mjs`; probes runner-hook, payload indirection, git-hook layers. |
| **A2** | Control Placement Table | `policies/control-placement.v1.json` + verify assertion for all shipped controls. |
| **A3** | Protected-Surface Baseline (#101) | `plugins/pipeline-core/lib/protected-baseline.mjs`, `protected-baseline.json`, `guard-testpath.mjs` integration. |
| **A4** | Design-Authority Sealing (#102)<br>• `plan-approval-binds-a-staging-draft`<br>• `set-feature-to-submit-plan-is-not-closed`<br>• `a-design-phase-prd-and-spec-are-frozen`<br>• `no-sanctioned-dispatch-trailer-form` | Lock `poGateAuthority` paths during implementation; reject staging-draft binding (`PLAN-BINDS-PRE-AUTHORITY-DRAFT`); seal and unfreeze lifecycle states cleanly. |
| **A5** | Lifecycle Evidence Closure<br>• `a-closed-result-can-be-amended-after-close` (A5-i)<br>• `discard-feature-writes-a-state-the-cleanup-observer-rejects` (A5-ii)<br>• `authority-gate-reads-the-worktree` (A5-iii) | Dynamic protected class for closed evidence; CAS-gated restore/repin verbs in `pipeline-state.mjs`; observer conformance suite (`pipeline-state-observer-conformance.test.mjs`); worktree vs HEAD divergence check. |

---

### Track B — Mechanical Governance & Typed Guard Routes
| Work Package | Deliverables & Backlog Items | Key Mechanisms & Files |
|---|---|---|
| **B1** | Minimum Rigor Floor (#105) | `plugins/pipeline-core/scripts/rigor-floor.mjs`, `policies/rigor-derivation.v1.json`; mechanical derivation from touch surface, reversibility, interruption history. |
| **B2-1** | Briefed Test-Change Route | Item `the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route`: PO-granted authorization binding `{targetPath, briefingDigest, expiry}`. |
| **B2-2** | Batchable TP-3 Registration Ceremony | Item `a-hardening-round-cannot-register-the-suites-it-writes`: Move suite registration to declarative `harness/verify-suites.json`. |
| **B2-3** | Read-Only Retry Lane | Return typed `retryAction` instead of human override on opaque read commands. |
| **B2-4** | Per-Key TOFU Trust Anchors | Item `critical-human-proof-policy-seeded-without-trust-anchor`: Add per-key records in `trustAnchors[]`, reject unanchored keys. |
| **B2-5** | CLI-Derived Signing Commands | Item `lifecycle-guard-does-not-know-the-human-signing-commands`: Derive signing command list directly from `po-human-approval.mjs`. |
| **B2-6** | Derived Capability Inventory | Derive `verify-phase` surfaces directly from registration file. |
| **B2-7** | Repo-Live vs Runtime-Live Disclosure | Item `critic-route-pre-check-not-in-force-in-installed-plugin`: Emit `DUTY-NOT-RUNTIME-LIVE` if checkout and installed plugin digests differ. |
| **B-Other** | PO Ack Gate & Fresh Clone State | Items `attended-po-acknowledge-gate-defaults-to-a-runner-that-cannot-satisfy-it` and `fresh-clone-loses-all-machine-local-pipeline-state`. |

---

### Track C — Measurable Rigor (Economics & Interruption Receipts)
| Work Package | Deliverables & Backlog Items | Key Mechanisms & Files |
|---|---|---|
| **C1 Slice 2** | Local Reporting Script | `plugins/pipeline-core/scripts/report-interruptions.mjs`: CLI report generator reading from store and calling `aggregateInterruptionReceipts`. Adds `/telemetry/interruptions/` to `.gitignore`. |
| **C1 Slice 3** | Orchestrator Emission Wiring | Connect live observers (`guard-observation`, `workflow-observer`, `readiness-observer`, `dispatch-observer`). |
| **C2** | Economics & Closing Allowance<br>• `long-dispatches-truncate-before-emitting-their-report`<br>• `critic-dispatches-cannot-persist-their-scratch-notes`<br>• `goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate`<br>• `verify-has-grown-to-269-suites-with-no-recorded-cost`<br>• `verify-range-mode-registration-for-orchestrator-commit-control` | `closingAllowance` in dispatch budget; preserve critic scratch notes under `.claude/scratch/`; record suite durations in verify runs; selective verify set design. |

---

### Track D — Agent-First Architecture Capability
| Work Package | Deliverables & Backlog Items | Key Mechanisms & Files |
|---|---|---|
| **D1** | Architecture Decision Continuity (#99) | Significance rubric (`architecture-baseline.mjs`), `architecture-decision` skill, `pipeline.architecture-decision.v1` schema, inheritance/conflict resolution. |
| **D2** | Agent-First Architecture Standard (#104) | 9 property classes in `agent-first-profile.v1.json`, OKF v0.1 concept bundle (`architecture/map/`), module inventory schema, navigation order. |
| **D3** | Architecture Fitness Enforcement (#106) | Evaluator `architecture-fitness.mjs`, fitness model file, 10 evaluated property classes, baseline & ratchet store. |
| **D4** | Architecture Adoption Demand (#109) | `architecture-adoption.mjs`, proposal generator, staged adoption states (`approved-scoped`, `deferred`, `partial`). |

---

### Track E — Integration & Release Qualification
- **E1 Contract Freeze:** Already established in `specs/sprint-alfred-epic/design/contract-freeze.json`.
- **E2 Qualification:** End-to-end qualification matrix covering PRD §7, full clean Verify run, independent Critic review, and PO terminal delivery sign-off.

---

## 3. Staged Execution Batches

1. **Baseline Checkpoint:** Clean candidate verified (`f0bbc84f3`).
2. **Batch 1 (High Impact, Self-Contained Governance & Telemetry Slices):**
   - **B2-5:** Derive signing command list in `guard-lifecycle-ready.mjs` from `po-human-approval.mjs` (closes `lifecycle-guard-does-not-know-the-human-signing-commands`).
   - **A5-ii:** Observer conformance & discard state cleanup (closes `discard-feature-writes-a-state-the-cleanup-observer-rejects`).
   - **C1 Slice 2:** Implement `plugins/pipeline-core/scripts/report-interruptions.mjs` and gitignore entry.
3. **Batch 2 (Core Lifecycle Controls & Guard Routing):**
   - **A4:** Design-authority sealing and staging draft rejection (closes 4 backlog items).
   - **A5-i & A5-iii:** Closed evidence integrity (restore/repin verbs) and authority worktree vs HEAD check.
   - **B2-2:** Declarative suite registration `harness/verify-suites.json`.
   - **B2-4 & B2-7:** Trust anchor TOFU and runtime-live disclosure.
4. **Batch 3 (Architecture Standard D1–D4 & Economics C2):**
   - Implement D1 (`architecture-baseline.mjs`), D2 (`agent-first-profile.v1.json`), D3 (`architecture-fitness.mjs`), D4 (`architecture-adoption.mjs`).
   - Dispatch economics and closing allowance (C2).
5. **Batch 4 (C1 Live Emitters & Integration Qualification):**
   - C1 Slice 3 live observer wiring.
   - Full integrated qualification (E2), comprehensive Verify, Critic review, and release readiness.
