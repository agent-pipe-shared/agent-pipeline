# Spec acceptance-criteria reconciliation (RECON-2A, 2026-10-07)

Scope: the 37 acceptance criteria of `acceptance.md` (the Spec carries no AC ids of its own; it has requirement families
R1-x..R7-x, RV-1..RV-11, U-1, mapped to AC-26..AC-37 by `traceability.md`). State read at HEAD of `feat/sprint-alfred`
plus `0.7-execution-order.md` "Current state" and "Earlier state". Conservative: partial or unverified-by-name = (b).
Evidence is by `git grep`/file presence only; no test was executed for this table.

Classes: (a) implemented · (b) in flight / partial · (c) not started · (d) protected / signed package · (e) PO / host action.

| AC | Gist | Class | Evidence | Note |
|---|---|---|---|---|
| AC-1 | Conformance records and placement rows consistent | (a) | `enforcement-conformance.test.mjs`, `control-placement.test.mjs`, `policies/control-placement.v1.json` | Per-runner host records not checked |
| AC-2 | No agent route mutates protected/approved/closed bytes | (b) partial | `lib/protected-baseline.test.mjs` | A3/A4/A5 fixtures not confirmed by name |
| AC-3 | Every pipeline-state verb passes all observers | (a) | `pipeline-state-observer-conformance.test.mjs` | Green status not re-run |
| AC-4 | submit/approve-plan refuse pre-authority staging paths | (b) partial | no A4-named fixture found | Unverified |
| AC-5 | Closed-evidence drift detect, fail-closed, repair verbs | (b) partial | `backlog/evidence/2026-09-13-discard-feature-observer-conformance.md` | 2026-08-27 replay not found |
| AC-6 | Interruption baseline and promotion evidence | (c) | no `interruption-baseline` in plugins/harness/policies/schemas | No test, no slice |
| AC-7 | Deterministic rigor floor and disagreement log | (b) partial | `rigor-floor.test.mjs`, `evidence/b1-minimum-rigor-floor.md` | Disagreement log not confirmed |
| AC-8 | Greenfield resolves inherited-agent-first disposition | (b) partial | `architecture-adoption.test.mjs`, `architecture/agent-first-profile.v1.json` | Custom-profile case unverified |
| AC-9 | Dogfood D4 adoption flow end to end | (e) | orientation shows `adoption.state: deferred` (`po-0.7.0-release-defer-2026-09-20`) | Needs PO decision and evidence set |
| AC-10 | Model-judged evaluator never yields pass | (b) partial | `architecture-fitness.test.mjs` mentions model-judged | Fixture name unconfirmed |
| AC-11 | Eight B2 routes, refusals name their route | (b) partial | R7-6-T7 `017df6cd5`, T8 `dbe72ffd5`, F3b in flight | Contradicts decision AC; realigned |
| AC-12 | Rules-as-code sweep: GG-22, strip, push-flow doc | (b) partial | `guardrails/git.md` GIT-09 defines GG-22; `backlog-item-strip-for-dispatch.test.mjs` | Strip stale-prose cases unconfirmed |
| AC-13 | All sprint backlog items closed or re-triaged | (e) | `plans/backlog-reconciliation-2026-10-07.md` (`0571fc432`) | Live count, GitHub trail at close |
| AC-14 | Every wave passes at least one Critic round | (b) | `evidence/critic-2026-10-07/`; deltas still owed per execution order | Continues to close |
| AC-15 | Per-issue documentation acceptance on candidate | (e) | none yet | Close-time, candidate-bound |
| AC-16 | Host-layout onboarding tests assert success contract | (b) partial | execution-order wave-0 note not located | Post-Nova re-derivation unverified |
| AC-17 | No implementation authority with unresolved disposition | (b) partial | `architecture-adoption-orientation.test.mjs` | Planning-boundary run unconfirmed |
| AC-18 | Stale map fails closed; checkpoint records debt | (b) partial | `architecture-adoption.test.mjs` only | D3 class-7 fixtures unconfirmed |
| AC-19 | Cross-runner decision parity or divergence finding | (b) partial | `architecture-effective-decisions.test.mjs` | Two-runner replay unconfirmed |
| AC-20 | Critic catches token ADR vs implementation | (b) partial | `architecture-fitness.test.mjs` | #99 §7 fixture unconfirmed |
| AC-21 | Anti-fragmentation rejects tiny-module shredding | (b) partial | `module-inventory.test.mjs`, `architecture-fitness.test.mjs` | #104 fixture unconfirmed |
| AC-22 | Planning findings carry remedy options | (a) | `architecture-remedy.test.mjs` | Comparison generator test present |
| AC-23 | AGENTS.md links map bundle; re-entry order resolves | (b) partial | no named fixture found | Walkthrough evidence missing |
| AC-24 | Provider-free AGY dispatch seam, typed receipt | (a) | `goldfish-antigravity-host.test.mjs`, `agy-session-dispatch.test.mjs`, `schemas/pipeline.cross-runner-dispatch-receipt.v1.json` | Fake-exe cases not individually checked |
| AC-25 | Native Claude/Codex host-commit | (a) | `native-goldfish-host-{state,return,finalizer,commit-execution}*.test.mjs` | Fresh-clone remains UNVERIFIABLE |
| AC-26 | Lifecycle-command admission (R1-1..R1-9) | (b) partial | `guard-lifecycle-ready.test.mjs`; Q12 `49d6f928d`, `e694f8509`; Q12-T7/F5 | Catalogue slice protected, not authored |
| AC-27 | Read policy (R2-1..R2-5) | (b) partial | no R2-labelled test found | Verify actual coverage; not located |
| AC-28 | Two-decision ceremonies (R3-1..R3-7) | (b) partial | `checkpoint-push-approval.test.mjs`, `guard-push*.test.mjs`; R7-6-F in flight | Ceremony inventory test not found |
| AC-29 | Runner/platform parity (R4-1..R4-10) | (b) partial | `model-family-*.test.mjs`, R7-11 `4311c6f96`, `46b500610` | No `fallback-self-dispatch` code (R4-1/R4-2) |
| AC-30 | Design-course contract (R5-1..R5-8) | (b) partial | stage-0 trailer in guards; design-course tests | No `--answers-file` code (R5-x) |
| AC-31 | Forensics/audit (R6-1..R6-5) | (b) partial | `runner-transcript-recovery.test.mjs` | No audit-index or continuity-digest code |
| AC-32 | Three-runner end-to-end happy path | (e) | none | Needs PO-run host sessions |
| AC-33 | Recovery availability (RV-1..RV-11) | (c) | no RV-labelled test; no external-route code found | Sequenced after R4 |
| AC-34 | Uninstall refuses with PU-FOREIGN-HOOK-CONFLICT | (c) | code `PU-FOREIGN-HOOK-CONFLICT` absent from plugins/harness | No test, no slice |
| AC-35 | Model-family approval and role mechanism | (b) partial | `model-family-*.test.mjs` (R4-11 shape) | R4-12 hook measurement missing |
| AC-36 | PO-decision ceremonies (R3-8..R3-10) | (b) partial | `checkpoint-push-approval.test.mjs` | 60-minute window case unconfirmed |
| AC-37 | Agent-recoverable operation (R7-1..R7-11e) | (b) | R7-1 `2532a96fe`, R7-7-F `35d876a11`, R7-11 `4311c6f96`, R7-6 in flight, U3 `8545160e8` | Device-switch walk not reached |

## Class (d): signed-package slices (supplement, not additional ACs)

Per `signed-package/README.md`, these protected slices contribute to AC-26, AC-28, AC-37 and the Verify-registration
duty: ENVDUMP-F wiring (patch staged), Verify registrations (TP-3/TP-13), R7-6 protected `pipeline-state.mjs` parts, R1
catalogue + R7-11e `hooks.json` + decision K/Q lanes + A-S3/C-S4 catalogue, ADR-0085 P0-P9. None applied. They are not
counted in the per-AC totals below (AC rows are classed by their dominant state).

## Counts per class (37 ACs)

(a) 5 · (b) 25 · (c) 3 · (d) 0 (see supplement) · (e) 4. Total 37.

## Class (c) list

AC-6, AC-33, AC-34. Sub-parts with no code found inside (b) rows: R4-1/R4-2 role-route preflight (AC-29), R5
`--answers-file` (AC-30), R6 audit index and continuity-digest drift (AC-31).

## Not reached

R-case level (R1-1..R7-11e, RV-1..RV-11, 77 register IDs, 20 T-rows) not classed individually; only AC level.
Most (b) rows are "unverified by name": a test may exist under another name.
