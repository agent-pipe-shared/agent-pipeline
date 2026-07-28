# Briefing — CYB-2E: `security-scan.mjs` v2 integration (Wave 4)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Dispatch metadata

- **Sub-package:** CYB-2E (Sprint Cyborg epic, `cyb-2-body-slicing.md` §1 row 5,
  Wave 4). Depends on CYB-2B + CYB-2D (both CLOSED).
- **Ruleset / candidate base:** `feat/sprint-cyborg-claude` @ HEAD `5555d08`
  (the only uncommitted working-tree file is `.claude/pipeline-state.json`, a
  bootstrap continuity repair irrelevant to this task — do not touch it).
- **Model / effort:** `goldfish-deep` / opus / **xhigh** — justified: migration
  of live, regression-covered production code in the highest-coupling file
  cluster of CYB-2, with genuine in-task wiring latitude.
- **Profile:** epic, execution phase.
- **Elephant design decision embedded (D9 — the pivotal one), advisor-consulted
  this session:** CYB-2E is **EXIT-NEUTRAL**. See "Field 1 / Option B" below.

## Field 1 — Goal

Wire the already-closed policy-complete building blocks into the security
aggregator and add a **second, additive** evidence emission, **without changing
the process exit code or any gate behavior**:

1. In `harness/scripts/security-scan.mjs`, after the existing per-scanner run
   loop produces its results, additionally:
   - Build the required/optional capability plan via
     `buildCapabilityPlan(resolveApplicableControls(<inputs>))`
     (`security-capability-plan-builder.mjs`, `security-policy-resolver.mjs`).
   - Map each scanner's outcome to its capability using each adapter's
     `CAPABILITY_CONTRACT_V2` (`gitleaks→cap.secrets`, `osv-scanner→cap.sca`,
     `semgrep→cap.sast`; `license-check` is `kind:"control"`,
     `capabilityId:null` → a control record, NOT a `cap.*`).
   - Translate the current scanner status/classification into the correct
     `RUN_OUTCOMES` member per capability (e.g. binary-missing SKIPPED on a
     **required** cap → `required-capability-missing`; on an **optional/absent**
     cap → `not-applicable`; PASS → `pass`; FINDINGS → `findings`;
     `execution_environment` ERROR → `execution-unavailable`; a dirty/uncertain
     candidate → the matching state). Use `evaluateAllCapabilities(candidate,
     plan)` + `aggregateVerdict(outcomeMap, plan)` from
     `security-evidence-evaluator.mjs`; use `projectRunOutcomeToControlResult`
     for the license-check control lane.
   - Assemble a `pipeline.security-evidence.v2` envelope that PASSES
     `validateSecurityEvidenceV2` (build capability/finding/coverage records to
     the exact shapes enforced by `validateCapabilityRecord`,
     `validateFindingEnvelope`, `validateCoverageRecord` — read those validators
     and satisfy them; AC4/AC5/AC6 identity + coverage fields must all be
     present, "empty" is a valid value, "absent" is not).
2. **Dual-emit (D9 compatibility window):**
   - Keep writing `evidence/security-latest.json` (schema
     `pipeline.security-evidence.v1`) with its **byte-shape unchanged** for the
     existing live consumers.
   - ALSO write the v2 envelope to a **separate** file
     `evidence/security-latest.v2.json`. Do not fold v2 into the v1 file.
3. **Option B — EXIT-NEUTRALITY (hard constraint, the reason this slice is safe):**
   The process **exit code MUST stay governed by the existing v1 blocking logic**
   (`blockingClass = hasErrorClass || hasBlockingFinding || candidateUncertain`
   → the current `mode`-based 0/1/2 mapping). The v2 policy-complete
   `aggregateVerdict` is recorded in the v2 evidence for reporting only; it MUST
   NOT influence `exitCode` in this wave. Rationale (advisor-confirmed): the
   exit code is already consumed live by `verify.mjs` (spawns security-scan and
   propagates its exit) and `guard-push.mjs` (reads v1 `exitCode`); the switch
   to policy-complete exit authority + the guard-push rewire is the dedicated,
   isolated, fully-regression-tested **CYB-2F** (Wave 5). Flipping exit
   semantics here would immediately break `verify.mjs` on every machine missing
   scanner binaries — including this one.

**Design latitude (yours to decide, briefly justify in the report):** how the
`resolveApplicableControls` inputs (assuranceLevel / activatedModules /
applicabilityInputs / catalogEntries) are sourced for the scan. Because Option B
makes the plan/required-set **evidence-only** this wave (never gate-affecting),
a non-empty required set that shows `required-capability-missing` in v2 evidence
is acceptable and expected on this machine — that is the honest record, not a
failure. Pick a defensible, documented sourcing (e.g. the repo catalog at
`governance/security-controls/catalog.json` + a baseline assurance default) and
state the choice; do not invent a new policy file or manifest schema key.

## Field 2 — Context files (read first)

- `harness/scripts/security-scan.mjs` — the file you edit. Study the run loop,
  `scannerEntry`, the `candidate`/snapshot machinery (leave it intact), the
  `evidenceCore`/`payloadSha256` write, and the exit-code block.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` — ACs 1–9, §4
  fixture matrix, §7 10-state enum.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` — §0 (coupling), §1
  row CYB-2E, §2 wave order, §3.2 (D9 window).
- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` — evaluator +
  validators + `RUN_OUTCOMES`/`CONTROL_RESULTS` (import only; do NOT edit).
- `plugins/pipeline-core/lib/security-capability-plan-builder.mjs` — `buildCapabilityPlan` (import only).
- `plugins/pipeline-core/lib/security-policy-resolver.mjs` — `resolveApplicableControls` (import only).
- `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` — CYB-2A's
  `FIXTURE_MATRIX` (the negative-gate classes your v2 verdict must classify
  correctly; the evaluator is what flips them off "not-yet-implemented").
- `harness/scripts/security-adapters/{gitleaks,osv-scanner,semgrep,license-check}.mjs`
  — their `CAPABILITY_CONTRACT_V2` exports (import only; do NOT edit adapters).
- `governance/security-controls/catalog.json` — the repo's control catalog.
- `harness/scripts/security-scan.test.mjs` — existing regression suite.

## Field 3 — Definition of Done (checks)

1. `security-scan.mjs` imports and uses `buildCapabilityPlan`,
   `resolveApplicableControls`, `evaluateAllCapabilities`, `aggregateVerdict`,
   `projectRunOutcomeToControlResult`, and each adapter's `CAPABILITY_CONTRACT_V2`.
2. A `pipeline.security-evidence.v2` envelope is produced that PASSES
   `validateSecurityEvidenceV2` for a real run; written to
   `evidence/security-latest.v2.json`.
3. `evidence/security-latest.json` (v1) is **unchanged in shape** — a v1
   consumer sees an identical structure to pre-CYB-2E.
4. **Exit-neutrality proof:** a test demonstrates that for representative input
   classes (all-pass, blocking finding, all-skipped/binary-missing, ERROR) the
   returned `exitCode` is **identical** to the pre-CYB-2E behavior. The v2
   verdict may differ (that is the point) but the exit code does not move.
5. A new test file (e.g. `security-scan-v2-integration.test.mjs`) covers: v2
   envelope validity, correct per-capability `RUN_OUTCOMES` mapping (incl. a
   required-capability-missing case and the license-check control lane), and the
   exit-neutrality assertions.
6. `node --test harness/scripts/security-scan.test.mjs` regression: the result
   is **byte-identical** to its pre-CYB-2E baseline (the known ~95/97 with the 2
   pre-existing `git`-not-on-`%PATH%` CLI-smoke failures — confirm via a
   `git stash` before/after, do not "fix" those). No new failure introduced.
7. `node --test` on your own new suite passes (exit 0).
8. Report includes: the design-latitude sourcing choice + rationale, the
   RUN_OUTCOMES mapping table you used, and the exit-neutrality evidence.

(Full aggregate `node harness/scripts/verify.mjs` + independent Critic + PO gate
are the Elephant's post-dispatch responsibility, not yours.)

## Field 4 — Prohibitions

- **MUST NOT change exit-code semantics** (Option B). If you find you cannot emit
  v2 without moving the exit code, STOP (see Field 5).
- **MUST NOT edit** any of: `guard-push.mjs`, `guardrails/security.md`, the four
  `security-adapters/*.mjs`, `security-evidence-evaluator.mjs`,
  `security-capability-plan-builder.mjs`, `security-policy-resolver.mjs`,
  `governance/security-controls/catalog.json`, or `verify.mjs`. Import/read only.
- No new runtime dependencies; no new manifest schema keys.
- Do not touch `.claude/pipeline-state.json`.
- Commit trailers: include `AI-Assisted: true` and the `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push.
- Do not weaken, skip, or platform-gate away real failures to make tests green.

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- Emitting a valid v2 envelope is impossible without changing the exit code, OR
  the evaluator/validator API does not match the signatures assumed here → STOP
  and report the exact mismatch (this would mean Option B needs re-decision).
- The plan-input sourcing appears to require a forbidden-file edit or a genuinely
  new foundational policy decision → STOP and hand the decision back.
- The existing `security-scan.test.mjs` baseline cannot be reproduced (i.e. you
  see failures beyond the known 2 `git`-PATH ones) before you change anything →
  STOP and report (environment problem, not your diff).

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report: DoD checks 1–8 with the
concrete command outputs (own suite result, the stashed before/after regression
counts, the exit-neutrality table), the design-latitude sourcing choice, and any
finding you deliberately did NOT fix in-scope (filed observation, not silent).
