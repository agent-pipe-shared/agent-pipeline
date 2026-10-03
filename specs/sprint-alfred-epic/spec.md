# Sprint Alfred Epic — Technical Specification

Design-gate revision. Per-WP implementation plans are authored under
[`plans/`](plans/) during the implementation waves, as in the Nova package;
this document fixes the contracts those plans implement. PRD:
[`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md).

## 1. Bound authority and scope

- Scope authority: ADR-0043 (2026-08-17 amendment); membership authority:
  GitHub #108. Issues #99, #101–#106, #109 plus the open `sprint: alfred`
  backlog items per [`design/backlog-intake.md`](design/backlog-intake.md)
  (28 as of 2026-08-28; the live assignment read via
  `check-backlog-sprint-assignment.mjs` is authoritative over this count).
- **Normative architecture basis:**
  [`design/agent-first-architecture.md`](design/agent-first-architecture.md).
  §7 implements it; where this document and the doctrine disagree on an
  architectural property, evidence class, or enforcement semantic, the
  doctrine governs and this document is corrected — not the other way round.
- Design base `a50c8093` on `feat/sprint-alfred`; implementation base is the
  post-Nova `origin/main` after rebase (PRD §5 wave 0).
- Current proposed package sources are `design-input.md`, this Spec, the
  PRD, `design.md`, and `traceability.md`; they do not change the reopened
  design/draft lifecycle state or grant implementation authority.
- Everything here binds agents and tools. Nothing here constrains the human
  repository owner acting outside the Pipeline (#101/#102 non-goals), and no
  control claims otherwise in its diagnostics.

## 2. Normative conventions

Reused verbatim from the Nova specification (`specs/sprint-nova-epic/spec.md`
§2) rather than restated: **closed records** (exact-key schemas, unknown keys
refused), **candidate and authority binding** (exact commit/tree + artifact
sha256), **frozen-contract composition**. Deltas introduced by Alfred:

- **2.1 Measurement status enum.** Every quantitative field in an Alfred
  schema carries `status: measured | estimated | unavailable | unknown`
  beside its value; absent telemetry is never zero (#103/#104 rule, made a
  repo-wide convention here).
- **2.2 Outcome enum.** Every evaluator outcome is one of
  `pass | finding | unavailable | unsupported | unknown | excepted` (#106).
  `pass` may only be produced by a deterministic check or an explicit human
  acceptance record — never by a model-judged evaluator, whose maximum is
  `finding` (candidate) — the **deterministic-pass rule**
  (research §2, extending #106's prompt-compliance ban).
- **2.3 Enforcement-layer declaration.** Every control shipped or modified by
  Alfred declares, in its own definition, `enforcedBy: git-hook |
  tool-scope | runner-hook | posthoc-verify | prose` — and `prose` is a
  visible admission, not a default. The A1 conformance record decides which
  declarations are honest per runner.

## 3. E1 — Shared contract freeze

First implementation act. One versioned artifact,
`specs/sprint-alfred-epic/design/contract-freeze.json`
(schema `pipeline.alfred-contract-freeze.v1`), fixing for every family:
`{family, schemaId, revision, digest, owner (WP), consumers (WPs)}`.

Frozen families (shapes in §9):

| Family | Schema id | Owner | Consumers |
|---|---|---|---|
| Enforcement conformance record | `pipeline.enforcement-conformance.v1` | A1 | A2–A5, B1, D3, E2 |
| Control placement table | `pipeline.control-placement.v1` | A2 | A3–A5, B2, D3 |
| Protected-surface baseline | `pipeline.protected-baseline.v1` | A3 | A4, A5, B1, D3 |
| Interruption receipt + registry | `pipeline.interruption-receipt.v1` / `-registry.v1` | C1 | B1, C2, C3, D2 |
| Architecture profile | `pipeline.architecture-profile.v1` | D2 | B1, D3, D4 |
| Architecture decision record | `pipeline.architecture-decision.v1` | D1 | D2, D3, D4 |
| Fitness evidence | `pipeline.fitness-evidence.v1` | D3 | B1, D4, E2 |
| Module/contract receipt | `pipeline.module-interaction-receipt.v1` | D2 | B1, D3 |
| Rigor derivation | `pipeline.rigor-derivation.v1` | B1 | E2 |
| Adoption state + proposal | `pipeline.adoption-state.v1` / `-proposal.v1` | D4 | B1, E2 |
| Verify-suite registration | `pipeline.verify-suite-registration.v1` | B2-ii | every WP (§12 registration duty), C2, D3 |
| Cross-runner dispatch receipt | `pipeline.cross-runner-dispatch-receipt.v1` | E3 | C1, E2 |

Freeze rules: a revision bump after freeze is a PO-visible decision recorded
in the freeze artifact's own append-only `revisions[]`; consumers pin the
digest they were built against; E2 verifies all pins agree at qualification.
C2's consolidation fields on the registration schema (`invariantPinned`,
`nonOverlapNote`, §6.2) are a pre-declared revision of exactly this kind,
landed through that `revisions[]` mechanism when C2 ships — not an unpinned
mid-sprint shape change.

The Enforcement conformance record is at revision 2: one record retains the
canonical `${runner.name}:${layer}` identity while `probeSurfaces[]` is a
non-empty, unique subsequence of the approved global surface order and
`observations[]` contains one closed, correlated raw observation per surface
in that same order. Singular `probeSurface` and `observation` fields are not
valid record shapes.

## 4. Track A — Enforcement ground truth and control integrity

### 4.1 A1 — Enforcement conformance probe

**Deliverable:** `plugins/pipeline-core/scripts/enforcement-conformance.mjs`
plus its Verify-registered check + fixtures.

**Mechanism.** A probe run produces one
`pipeline.enforcement-conformance.v1` record per `{runner, layer}`:

- `runner-hook/orchestrator`: attempt a canonical guard-refused shape
  (compound shell command) in the main session context — expect refusal.
- `runner-hook/subagent`: dispatch a minimal probe subagent briefed to
  attempt the same canonical refused shapes and to report raw outcomes;
  compare against guard observation records (e.g. the dispatch-budget
  guard's marker files) to distinguish "hook fired and allowed" from "hook
  never fired". Outcome per hook family: `fires | fires-not | unknown`.
- `payload-indirection`: write a refused command into a scratch script via a
  permitted write, execute the file — records whether any layer catches it
  (expected today: only the git-hook layer, for push shapes).
- `git-hook`: with the pre-push hook installed, attempt a push shape that
  the push gate must refuse — expect refusal *regardless of invoking agent*;
  plus `--no-verify` recorded as the accepted residual gap (PO decision
  2026-08-27).

**Consumption.** The record is required input to A2; the stale `$comment` in
`plugins/pipeline-core/hooks/hooks.json` (which asserts subagent hooks fire)
is replaced by a pointer to the record. That file is TP-4 — its own protected
class, which B2-ii's route does not cover (B2-ii exists solely for TP-3 suite
registration and lands a wave later) — and it is plugin source in a source
checkout, for which the standard human-guard-override plans
`author-repair-required` rather than an armed override, and needing such a
path is a dispatch stop condition (`templates/prompts/agent-obligations.md`
§2). The replacement is therefore designed as a **PO-performed act, not an
agent-side ceremony**: A1 prepares the exact contiguous replacement text,
and the PO applies it in their own shell outside the agent boundary (§1 —
the human repository owner is unconstrained; §10 — the sprint adds
PO-executable routes, never agent mutation rights), recorded in the A1
evidence and scheduled inside A1's Wave-0 slot. The pointer edit is a
courtesy, not load-bearing: the A1 record is authoritative over the
`$comment` from the moment it exists, so a deferred PO edit blocks no gate —
the stale comment is then carried as a typed residual row in the A2 table
until edited. Probe re-runs are cheap and mandatory on runner/plugin
version change; the record carries `{runnerVersion, pluginVersion,
measuredAt}`.
A1 also produces the minimal reproduction for an upstream runner report
(PRD §6: reported, not owned).

**Fixtures:** record-shape validation; a simulated "hooks fire" and "hooks
don't fire" probe transcript each classify correctly; version-change
staleness flags.

### 4.2 A2 — Control placement

**Deliverable:** `pipeline.control-placement.v1` table (one row per control:
`{controlId, protects, enforcedBy[], perRunnerStatus, residualGaps[]}`)
shipped as a versioned artifact + a Verify check asserting (a) every control
in `hooks/hooks.json` and every Alfred-shipped control has a row, (b) no row
claims a layer the A1 record contradicts for the active runner, (c) `prose`
rows enumerate their compensating detection.

**Placement policy (normative):**
1. Anything that must hold for *dispatched* work is enforced by git hooks
   (executes in git's own process for any caller), tool scoping (a
   capability absent from the agent definition cannot be misused), or
   post-hoc deterministic verification (Elephant-side, against evidence) —
   runner hooks count only where A1 measures them firing.
2. Parameter-text classification (the current PreToolUse guards) is retained
   as **orchestrator-session friction reduction and early signal**, never
   cited as the enforcing layer for a control (payload indirection, measured
   2026-08-27).
3. Post-hoc verification is detection, not prevention: it may be the sole
   layer only for controls whose harm is reversible before push/close, and
   the placement row must say so.

**Concrete first placements:** push gate → git pre-push hook (exists;
onboarding offer becomes a default-on step with decline recorded — closing
the "nothing installs it" gap); commit-shape rules (GG-XX family) →
pre-commit/commit-msg evaluation (new, B-wave); protected-surface writes →
tool scoping for goldfish tiers (already partial) + post-hoc protected-delta
check at candidate time (new: `check-protected-delta.mjs`, diffs the
candidate against the baseline's protected set); state-writer integrity →
sanctioned-writer CAS (exists) + A5's conformance suite.

### 4.3 A3 — Protected-surface baseline (#101)

**Deliverables:**
`plugins/pipeline-core/lib/protected-baseline.mjs` (baseline definition +
loader + merge), baseline data file shipped inside the plugin
(`plugins/pipeline-core/protected-baseline.json`, schema
`pipeline.protected-baseline.v1`), rework of `guard-testpath.mjs` config
resolution to consume the merged result, migration readback for existing
`project/guard-config.json`, fixtures per #101's list.

**Contract (per #101, concretized):**
- Baseline entries carry `{id, pathPattern, class: config|loader|hook|
  contract-test|verify-registration|sanctioned-writer, rationale}`; minimum
  membership exactly #101's six classes — including the baseline file and
  loader themselves and `check-protected-delta.mjs` (self-protection).
- Merge: `effective = baseline ∪ projectAdditions`; project entries may only
  add. Subtraction/shadow/alias attempts (path aliasing, case variants,
  symlink retarget) are detected by resolving both sets through the same
  physical-path canonicalization the guards already use, and produce typed
  `PB-SUBTRACTION-ATTEMPT` diagnostics without honoring the subtraction.
- Absent/unreadable/malformed/duplicate project config ⇒ baseline-only +
  `PB-CONFIG-INVALID` diagnostic. Never zero protection.
- Effective identity `{baselineRevision, baselineDigest, mergedDigest}` is
  written into verify evidence and consumed by B1 as a rigor input.
- **Alfred extension (A5 link):** the baseline includes a *dynamic class*:
  paths bound by `closedFeatures[].continuityClose` entries of the governed
  repo join the effective set at state-read time (loader reads the state
  file; a state read failure ⇒ the dynamic class is `unavailable`, reported,
  and the static baseline still holds).

### 4.4 A4 — Design-authority sealing (#102)

**Deliverables:** extension of the dev-plan/lifecycle guard family +
`pipeline-state.mjs` preconditions + fixtures.

- **Sealing:** while lifecycle is `implementing`, the exact
  `planApproval.poGateAuthority.{planPath,specPath}` files are refused for
  agent mutation across supported routes per A2 placement: guard lane for
  the orchestrator; post-hoc `check-authority-drift` (already exists as
  drift detection — extended to run in the candidate gate) for dispatched
  work; tool-scope note in goldfish briefing templates. Proposal/scratch/
  change-request artifacts stay writable (their own declared locations).
- **Out-of-band drift** stays invalidated authority (existing behavior),
  with the repair route now typed (A5's repair verbs) instead of dead-ending.
- **Entry guard (staging-draft defect):** `submit-plan` and `approve-plan`
  refuse `planPath`/`specPath` that (a) resolve inside
  `project/.onboarding-staging/` or (b) whose file carries the generated
  pre-authority banner line — typed
  `PLAN-BINDS-PRE-AUTHORITY-DRAFT` naming the promotion action. Route
  question from the item is thereby answered: promotion becomes a
  precondition of approval on every route.
- **Transitions:** `reopen-design` unchanged; #97's amendment path is
  consumed *if it exists on the implementation base*, else its absence is a
  recorded limitation (typed, in the A2 table), not an invented substitute.

### 4.5 A5 — Lifecycle evidence closure

Three deliverables, each with its own suite:

**(i) Closed-evidence integrity.** Write-time: closed-evidence paths are in
the A3 dynamic protected class from the moment the close writes the entry.
Detection-time: `classifyOnboardingContinuity` verifies `closedFeatures`
bindings on **every** branch that reads the state (active branches emit
`CLOSED-EVIDENCE-DRIFT` as a *diagnostic* without flipping readiness — the
active feature's own work must not be hostage to historical drift — while
inactive branches keep failing closed as today). Repair-time: two new
PO-gated verbs in `pipeline-state.mjs`:
`closed-evidence-restore-plan/apply` (restore pinned bytes from the close
commit) and `closed-evidence-repin-plan/apply` (adopt current bytes with PO
authority; append-only `evidenceRepins[]` audit trail). Plan/apply,
CAS-bound, same ceremony class as existing critical verbs.

**(ii) Writer/observer conformance.** New suite
`pipeline-state-observer-conformance.test.mjs`: for every sanctioned
`pipeline-state.mjs` verb reachable in a fixture repo, execute the verb and
assert `classifyOnboardingContinuity` AND `observeSessionCleanupState`
accept the resulting state (`valid`/non-malformed). Includes the direct fix:
`observeSessionCleanupState` learns the discard shape via the existing
`validDiscardedTransitionState` (design/closed branches mirrored;
`sessionCleanup: null`). The suite is the regression fence for the whole
class, not just the discard instance.

**(iii) Authority worktree/HEAD divergence.** The authority gate additionally
compares each authority path's worktree bytes against `HEAD` (`git show`),
emitting `AUTHORITY-WORKTREE-HEAD-DIVERGENCE` naming path + which side is
missing/differs. Warning, not refusal (pre-commit checking is the gate's
purpose); the PRD-cardinality check runs against both views and reports per
view. Semantics documented at the gate's own doc block.

## 5. Track B — Mechanical governance

### 5.1 B1 — Minimum rigor floor (#105)

**Deliverable:** `plugins/pipeline-core/scripts/rigor-floor.mjs` (pure
derivation, injectable inputs) + registry file
(`policies/rigor-derivation.v1.json`) + report-only integration at plan
submission and pre-close + fixtures per #105's list.

- **Inputs (first increment, each `{value, status, sourceContract}`):**
  planned/actual path surface; protected-surface touches (A3 identity);
  public contract/dependency/toolchain deltas (deterministic diff classes);
  architecture profile id/source/digest + fitness outcomes (D2/D3, once
  present — `unavailable` before); interruption-lineage counts for the
  feature (C1); reversibility class; diff size (never sufficient alone —
  a floor input, not a ceiling one).
- **Derivation:** versioned pure function `{inputs} → {minProfile,
  requiredEvidenceClasses[], escalationTriggers[], derivationRevision,
  inputDigest, explanation}` — same normalized inputs ⇒ same output
  (fixture-pinned). Unknown/unavailable inputs can only raise, never lower.
  Human-selected rigor, when higher, is recorded beside the floor.
- **Asymmetry enforcement:** the derivation consumes only mechanically
  produced inputs (no free-text plan fields); an agent-supplied *planned*
  surface is admitted but recomputation against the *actual* candidate
  before close may only retain or escalate (#105 §4 verbatim).
- **Rollout:** report-only rows in verify evidence + a disagreement log
  (`selected vs derived`) until sufficient C1 calibration evidence exists; promotion
  to enforcing is a Wave-4/5 PO decision with the disagreement log as its
  evidence. Mini (#11) consumes the derivation as a special case, not a
  second classifier.

### 5.2 B2 — Typed routes at guard boundaries

Eight designed fixes; each names its enforcing/affected artifact, its prior
decision (⚖ = PO-decided in the item), and its acceptance fixture.

1. **Briefed test-change authorization** ⚖ — new capability in the
   testpath-guard family: a PO-granted authorization binding
   `{targetPath, briefingDigest (goldfish-task 6-field text), expiry}`,
   granted *before* dispatch via signature-or-chat per
   `gates.push_approval` duality; the guard admits the exact target for a
   dispatch presenting the matching briefing digest; refusals state which
   situation applies (`route-available-via-briefed-authorization` vs
   `no-route-for-this-target`). Four ⚖ constraints from the item are the
   acceptance bar.
2. **Batchable TP-3 registration ceremony** ⚖(direction) — risk-class
   answer, normative: *appending a suite registration entry* is a distinct,
   lower-risk act than *editing gate logic*; implemented not by weakening
   TP-3 but by moving suite registration out of `verify.mjs`'s protected
   body into a declarative registration file
   (`harness/verify-suites.json`, schema-validated, append-only-checked, its
   own new TP class allowing append-shaped changes under a single
   block-level ceremony), which `verify.mjs` reads. One ceremony per block,
   command known in advance, reviewable before signing. (Also the enabling
   condition for this sprint's own many registrations.)
3. **Read-only retry lane** — `opaque-interpreter-code` refusals return a
   typed read-only `retryAction` (the same expression re-rooted through the
   guard's own bounded read form) instead of only the signature ceremony;
   fail-closed classification itself unchanged.
4. **Per-key TOFU trust anchors** ⚖ — `trustAnchors[]` gains per-key
   records; an unrecognized well-formed key triggers signature-or-chat
   confirmation before first use; confirmed keys persist; agents cannot
   write anchor records (protected via A3 baseline). Bootstrap surfaces
   `signature mode configured, no usable anchor` as a typed pre-wall check.
5. **CLI-derived signing-command list** ⚖(direction 2) — the lifecycle
   guard's `isHumanPoSigningCommand` derives from `po-human-approval.mjs`'s
   exported command table (single source), with a conformance test failing
   on divergence.
6. **Derived capability-inventory surfaces** — `verify-phase` surfaces in
   `docs/product-capability-inventory.json` become derived-at-check-time
   from the (B2-ii) registration file; the inventory file keeps only
   categorization; the four-recurrence class ends structurally.
7. **Repo-live vs runtime-live disclosure** — preflight compares checkout
   plugin identity against installed plugin identity (both already read) and
   emits a typed `DUTY-NOT-RUNTIME-LIVE` note listing agent/skill/template
   files whose checkout digest differs from the installed copy; close-block
   refuses present-tense "in force" closure claims for such files without
   the note attached.
8. **Gitleaks fingerprint diagnostics** — on a blocked scan, if an ignore
   entry matches `{path, rule, column, secret}` but not `line`, say so and
   print the recomputed entry; plus a `--recompute` helper subcommand.

### 5.3 B3 — Rules-as-code sweep

Mechanical batch, one dispatch: GG-22 defined in `guardrails/git.md`
(reconciliation committed alone; checker-before-ledger-commit; full-OID
rule) cross-linked from `backlog/README.md`; SendMessage scope-relay rule
added to `workflow-dispatch.md`; `docs/push-release-flow.md` `--expires-at`
claim corrected + CLI error message states the exact wanted form with the
corrected value; `backlog-item-strip-for-dispatch.mjs` strips the Triage
section body and later sections or inline markers that are independently
verdict-/closure-shaped, without discarding genuine later requirement or
decision content. A later heading alone is not a license to strip the rest
of the item. Preserve the Triage-boundary and later-sections fixtures and
add regressions for contamination beyond Triage.

## 6. Track C — Measurable rigor

### 6.1 C1 — Interruption receipts (#103)

**Deliverables:** `plugins/pipeline-core/lib/interruption-receipts.mjs`
(emit + aggregate), registry `policies/interruption-registry.v1.json`
(typed-code → category derivation rules, versioned), local report script,
fixtures; emission wired where the orchestrator already observes the events
(guard refusals, gate waits, dispatch failures/truncations, readiness
transitions) — orchestrator-side by design, so it works regardless of the
A1 subagent-hook finding.

- Receipt fields exactly #103 §Scope-1 (lineage, phase, runner/role, typed
  code + normalized category, classification + derivation revision,
  timestamps, blocked wall time, attempt/recovery counts, resolution
  reference, candidate binding, collection status).
- Seed registry entries include the four interruption classes measured live
  in this repository (read-only-refusal and the readiness-`partial`
  deadlock, both 2026-08-27; TP-ceremony wait as `external-wait`,
  2026-08-18; dispatch truncation, 2026-08-08 — provenance in
  `design/issue-intake.md` #103) so dogfood starts on real codes.
- Privacy: no prompts/transcripts/secrets/private paths; receipts live under
  the ignored `evidence/` root, aggregates under `telemetry/`.
- **Dogfood evidence:** first wave lands it; `interruption-baseline.json`
  records the actual collection window and evidence coverage. Per the PO
  decision of 2026-09-13, no fixed 14-day release or promotion wait applies.
  B1 promotion and D2 thresholds require sufficient measured calibration
  evidence and the existing PO promotion decision; elapsed days alone prove
  neither. Missing or insufficient evidence remains explicitly unavailable
  or report-only, never calibrated PASS.

### 6.2 C2 — Dispatch and Verify economics

- **Token breakdown** ⚖: instrument one `goldfish-deep` + one `critic`
  dispatch (transcript-derived phase segmentation: bootstrap / work /
  report), recorded as a measurement artifact; optimization only if a
  dominant lever emerges (>40% share), else the item closes with the
  measurement.
- **Closing allowance** ⚖(PO direction): `goldfish-task.md`/dispatch-budget
  contract gains a `closingAllowance` — on budget exhaustion the dispatch
  may only commit-green/write-record/emit-report; the record's log gains
  `{phase, toolUseCount}` per entry and is created as the opening act
  (both from the item's adopted practices). The structured handover shape
  (`remaining[]`, per-item state) is fixed in the template.
- **Selective-Verify set design** ⚖(part-3 shape PO-decided): consume the
  landed `durationMs`/`reused` evidence after one fresh full run at the
  implementation base; produce the selective work-tier membership per
  ADR-0065's eligibility rules; full Verify stays the candidate/push
  boundary. Design lands as an ADR-0065 addendum + membership artifact.
- **Consolidation rule** (part 4): a new suite registration (B2-ii file)
  requires `{invariantPinned, nonOverlapNote}` fields; the registration
  check refuses entries without them. (Also the D3 promotion pathway's
  landing site: promoted agentic findings arrive as registrations with the
  invariant named.)
- **Optional tail:** range-mode commit-type audit exactly per the item's
  carried design; droppable (PRD §9.5).

### 6.3 C3 — Cadence validation

With sufficient measured coverage: report over C1 receipts + Verify durations
comparing per-dispatch vs collection-block cadence cost for the sprint's own
waves; close the cadence item per its own acceptance text (evidence-backed
recommendation, policy already encoded). Report the actual collection window
and limitations; no fixed calendar wait replaces the evidence-quality check.

## 7. Track D — Agent-first architecture capability

### 7.1 D1 — Architecture decision continuity (#99)

**Deliverables:** significance rubric + assessment
(`plugins/pipeline-core/scripts/architecture-baseline.mjs`), decision skill
(`plugins/pipeline-core/skills/architecture-decision/`), decision-record
schema, close-path impact recording, adoption flow, fixtures.

- **Rubric:** deterministic checklist over the five #99 significance axes,
  enumerated rather than referenced — a decision is architecturally
  significant when it materially affects (1) system structure or component
  boundaries; (2) runtime, framework, dependency, storage, or integration
  strategy; (3) deployment and execution environment; (4) quality attributes
  (security, privacy, reliability, portability, performance, …); (5) choices
  that are costly, risky, or hard to reverse. Output one of
  `initial-adr-required | architecture-baseline-sufficient |
  no-material-architecture-decision`, evidence-bound (which axis fired).
  Explicit non-goal: no ADR for every implementation detail.
- **Decision skill capabilities** (project-neutral, explicitly invokable),
  all seven: assess significance; draft a concise ADR from governed evidence;
  identify applicable inherited decisions; propose an explicit human waiver
  for a needed deviation; supersede rather than rewrite; update the living
  summary and its references; validate status, identity, applicability,
  supersession, and traceability. It never approves its own decision or its
  own exception.
- **Decision records:** `pipeline.architecture-decision.v1`
  `{id, status: proposed|accepted|superseded|waived, digest, scope,
  supersedes?, exception?: {authority, rationale, scope, expiry}}` stored in
  the governed repo's `docs/adr/` (existing convention; the schema is a
  frontmatter/JSON sidecar, not a new directory kind — ADR-0063 respected).
- **Inherited layers:** resolver consumes configured org/team sources
  through #9's interface *when configured* (id, digest, layer, applicability,
  authority class, freshness — referenced by identity, never copied
  wholesale; public evidence sanitizes org coordinates); unconfigured ⇒
  Pipeline+project layers, typed `org-source: none`. Applicable
  company/team decisions are agent-enforced, human-waivable governed
  defaults: an agent may not silently ignore, weaken, reinterpret, or
  override them, and directory location or a folder name never establishes
  authority.
- **Conflict semantics — all seven #99 §4 cases, resolved deterministically:**
  (1) governed default without exception → follow; (2) explicit scoped
  exception → follow the exception and preserve the reference to the
  original; (3) incompatible inherited decisions → escalate to the owning
  human layer, never pick one; (4) project ADR against a higher authority →
  rejected without a valid scoped exception; (5) advisory deviation →
  allowed with a named rationale where acknowledgement is required;
  (6) unavailable optional guidance → typed and unsatisfied, never falsely
  consumed; (7) unavailable **mandatory** source → blocks the dependent
  decision.
- **Waiver record fields:** decision, rationale, scope, affected authority,
  and duration or supersession condition. A waiver leaves the original
  authority intact. Waivers are decision records with `exception` filled,
  PO-authored (D-track shares B2's signature-or-chat ceremony for the
  authorship act).
- **Session consumption:** a compiled decision summary
  (`project/architecture-decisions.compiled.json`: ids, one-line summaries,
  applicability, status, active exceptions) bounded in size, regenerated by
  the assessment script, read at bootstrap — never the full ADR estate.
- **Close impact:** every close reports exactly one typed value —
  `architecture-conforms | architecture-decision-added |
  architecture-decision-superseded | architecture-summary-updated |
  no-architecture-impact` — recorded via `ritualExtensions.close.pre` (intake
  deviation: no second close path). #97's change-request path consumes it, so
  a bounded implementation-phase change can supersede architecture without
  reopening design. A checkpoint exit without a close is covered by the
  push-boundary staleness debt (§7.3) instead.
- **Semantic conformance is the Critic's duty, not a file-presence check:**
  the review verifies conformance to the applicable decisions and active
  exceptions. The fixture set includes a **token ADR that does not match its
  implementation**, which the review must catch (#99 §7). Material
  architecture changed without a decision, supersession, or exception fails
  closed before final acceptance; recovery never fabricates historical
  decisions.
- **Decision parity:** two fresh sessions on different supported runners,
  given the same governed area and the same declared estate, reach the same
  disposition, or the divergence is emitted as a typed finding (PRD S9).
- **Adoption:** present-state baseline acceptance per #99 §8 — inventory,
  human approval, forward-looking ADRs only. **The decision estate migrates
  with the standard** (doctrine §6): the mechanism (`docs/adr/` + sidecars +
  the decision skill) installs as part of adoption rather than being earned;
  the accepted baseline is the estate's first record, honestly dated; the
  existing codebase's implicit decision mass is captured **on touch** — when
  work first materially touches an area, the rubric fires and a significant
  inherited decision is recorded as `accepted` with its real capture date,
  never backdated. Mass backfill is welcome and never demanded.

### 7.2 D2 — Agent-first architecture standard (#104)

**Deliverables:** the shipped profile
(`plugins/pipeline-core/architecture/agent-first-profile.v1.json`), module
inventory + navigation bundle conventions, receipt emitters, profile
resolution, the remedy-comparison generator, fixtures.

- **Profile:** the nine #104 property classes as versioned machine-readable
  properties `{propertyId, class, declaration | signal | check,
  measurementStatus semantics, blocking: advisory-first}`. First-increment
  honesty rule (intake deviation): properties whose measurement needs
  runner-side telemetry that A1 shows unavailable are declared with
  `signal: unavailable-on-<runner>` rather than fake numbers.
- **The nine properties and their first-increment evidence class**
  (doctrine §2, one row each; the doctrine holds the full definitions and
  the per-property anti-goal):

  | # | Property | First-increment evidence |
  |---|---|---|
  | 1 | Context locality | **signal** — receipts from briefing surface, candidate diff, transcript tool logs where exposed; `unknown` where the runner does not expose them |
  | 2 | Contract sufficiency | **check** (contract exists, digest matches inventory revision) + the eleven signals below |
  | 3 | Change locality | **check** — candidate diff vs. planned/authorized boundary set |
  | 4 | Dependency legibility | **check** via language-scoped import-graph adapter, explicit `unsupported` for uncovered languages |
  | 5 | Authority/effect locality | **declaration** (ownership rows) + **check** where mechanical; semantic depth `unsupported`, named as such |
  | 6 | Verification locality | **check** — declared verification entry points exist; candidate records required affected-integration checks |
  | 7 | Session re-entry stability | **check** — map currency for the candidate, plus the §3 estate; parity criterion across two runners |
  | 8 | Parallel work safety | **check** — write-surface intersection across concurrently dispatched packages |
  | 9 | Refactorability without churn | **check** — accepted identities change only through a D1 decision; tiny-module anti-gaming fixture |

- **Contract-sufficiency signals.** #104 derives them "for at least" the
  following eleven — a floor, not a closed set (items verbatim): missing
  required contract; contract contradicted by implementation; stale contract
  or architecture view; foreign implementation inspection required beyond the
  accepted boundary; hidden dependency or cyclic traversal; repeated
  cross-boundary lookup; late scope expansion; review-discovered architecture
  assumption; verification not locally available; authority/side-effect
  ownership unclear; and — the positive outcome — sufficient contract for the
  bounded task. Signals preserve uncertainty, cannot claim semantic
  completeness from file counts alone, feed the receipts, the optimization
  loop and the rigor floor (#105), and never produce `pass`.
- **Resolution:** `effectiveProfile = acceptedCustom ?? inherited-agent-first`
  (never `unconfigured`); missing/stale/invalid profile evidence is
  non-green (#104 verbatim); custom profiles are D1 decision records.
- **Navigation representation:** pluggable contract; shipped default = OKF
  v0.1 bundle (`architecture/map/` in the governed repo: one concept file
  per module, YAML frontmatter carrying the machine fields, links forming
  the graph), pinned by SPEC.md digest recorded in the profile;
  AGENTS.md-linkage property: the repo's AGENTS.md references the bundle
  entry point (research §1). Representation choice recorded as a repo ADR
  now, re-bound through D1 machinery once live (intake bootstrap
  deviation).
- **Concept-file frontmatter fields.** Each concept file carries all six
  #104 §2 contract-sufficiency fields — responsibility and
  non-responsibilities; public inputs, outputs, invariants, errors, and side
  effects; dependency and authority boundaries; compatibility and lifecycle
  expectations; verification entry points; the exact implementation↔contract
  revision binding — plus the module-identity fields of the governed-module
  inventory below, because the concept file is where both physically live.
- **Module inventory:** `pipeline.module-inventory.v1` rows exactly per
  #104's governed-inventory list — identities, owned paths, contract
  surfaces, dependency direction, effect ownership, verification entry
  points, ADR references, profile source, and the exact candidate/baseline
  binding — never invented from directory names or one model's
  interpretation (#104, verbatim); provisional identities allowed and marked
  until D1 acceptance.
- **Re-entry reading order.** The estate declares the order a fresh session
  (or dispatch briefing generator) reads it in, exactly as doctrine §3.2
  fixes it: (1) `AGENTS.md` — entry, conventions, map pointer; (2) the map
  index — the graph's root; (3) the concept files of exactly the modules the
  task touches, bounded by task surface and never by repository size; (4) the
  compiled decision summary, filtered by applicability; (5) lifecycle state
  and sanctioned next actions, via the existing bootstrap; (6) only then the
  owned implementation surface. The order is part of the contract, not a
  convention: PRD S8 measures re-entry against it, and D3 class 7 fails
  closed when the map it points into is stale for the touched contracts. Its
  defining rule is sufficient context **without foreign implementation
  reads** — a task that needed them anyway produces the signal `foreign
  implementation inspection required beyond the accepted boundary`, not a
  session failure.
- **Derived views, never parallel ones.** Human-readable architecture
  documentation (`docs/ARCHITECTURE.md` in a governed repo) is *generated*
  from the map bundle. A hand-maintained parallel document is a defect, not
  an alternative: it is the mechanism by which the machine-readable estate
  silently goes stale.
- **Active optimization (remedy comparison).** The profile ships a generator
  that, for a finding, proposes conformant remedy options with their
  comparison — the standard *proposes conformant structure*, it does not only
  report violations (doctrine §5.3). It never applies a remedy and never
  authorizes one: agent-proposed, human-decided, and subject to the same
  anti-churn boundary as every other structural change (doctrine §2.9,
  refactorability without structural churn).
- **Receipts:** `pipeline.module-interaction-receipt.v1` per applicable
  dispatch, first increment fed from briefing surface + candidate diff +
  transcript tool logs where exposed; every metric carries the §2.1 status.

### 7.3 D3 — Fitness enforcement (#106)

**Deliverables:** evaluator
(`plugins/pipeline-core/scripts/architecture-fitness.mjs`), fitness model
file per governed repo, baseline/ratchet store, lifecycle wiring, fixtures
for every 21-item #106 fixture list entry.

- **Enforcement invariant:** exactly #106's — id, closed schemas,
  deterministic check or bounded adapter, outcome enum (§2.2), digests,
  blocking policy, fixtures — plus the deterministic-pass rule (§2.2).
- **Fitness model.** One machine-readable file per governed repository,
  representing at least the following eleven items (#106 §Scope-2, verbatim):
  accepted/provisional module identities and owned surfaces; public contract
  identities and implementation bindings; allowed, denied, and exceptional
  dependency directions; allowed boundary crossings; authority and
  side-effect ownership; verification entry points and locality; architecture
  navigation/re-entry artifacts; planned parallel-work overlap constraints;
  measurable context/change/contract thresholds from #104 once calibrated;
  severity and blocking policy; and required evidence classes. Accepted
  authority is never inferred solely from a directory tree or model output.
- **Declared ↔ evaluated mapping.** The nine declared D2 properties and the
  ten evaluated D3 classes interlock but are not 1:1; the joint is explicit
  (doctrine §2.10) and complete in both directions — no declared property
  without an evaluation route, no evaluated class without a declared parent:

  | Declared property (D2) | Evaluated by (D3 class) | First-increment form |
  |---|---|---|
  | 1 Context locality | 10 calibrated friction thresholds (armed post-C1) + receipts | signal, status-carrying |
  | 2 Contract sufficiency | 2 contract presence/freshness (+ contradiction signals) | check + signal |
  | 3 Change locality | 4 boundary crossing vs. planned surface | check (diff-derived) |
  | 4 Dependency legibility | 3 dependency direction/cycles | check / `unsupported` |
  | 5 Authority/effect locality | 5 authority/side-effect ownership | declaration + partial check |
  | 6 Verification locality | 6 verification locality | check |
  | 7 Re-entry stability | 7 navigation/re-entry currency | check |
  | 8 Parallel work safety | 8 parallel overlap | check |
  | 9 Refactorability w/o churn | 9 profile drift (identity stability) | check |
  | — foundation for all — | 1 module identity/ownership (path→module resolution) | check (inventory) |

- **Promotion pathway.** A recurring agentic finding is promoted into a
  deterministic rule, landing as a B2-ii suite registration that must name
  the invariant it pins (`invariantPinned`, C2 consolidation rule). This is
  how the property catalog gains checks over time — designed growth, not
  accretion.
- **Ten property classes:** first increment implements deterministically:
  module identity/ownership (path→module resolution), contract
  presence/freshness (digest match vs inventory), dependency
  direction/cycles (language-scoped import graph adapter with explicit
  `unsupported` for uncovered languages), boundary crossing (diff vs
  declared surface), navigation currency (bundle digest vs touched
  modules), profile drift (digest comparison), parallel overlap (dispatch
  write-surface intersection), authority/effect ownership + verification
  locality (declaration-presence first, semantic depth explicitly
  `unsupported` where not mechanical), calibrated friction thresholds
  (armed only with sufficient measured C1 calibration and the required promotion
  approval, not merely after a fixed elapsed window).
- **Baseline-and-ratchet:** `architecture-baseline.json` per repo (accepted
  violations, unknown coverage), net-new/worsened blocking at configured
  boundaries, deterministic reduction, PO-only transitions — #106 §4
  verbatim.
- **Lifecycle placement:** planning (disposition validation before
  implementation authority), dispatch (briefing surface projection +
  post-hoc comparison per A2 policy), pre-close (actual candidate), push
  (map/contract freshness; candidate/publication fail closed; checkpoint
  pushes record typed staleness debt consumed by next planning), CI (same
  evaluator). Report-only in Wave 3; blocking per boundary promoted in
  Waves 4/5 with fixtures + dogfood evidence.

### 7.4 D4 — Adoption demand (#109)

**Deliverables:** adoption-state resolver + proposal generator
(`plugins/pipeline-core/scripts/architecture-adoption.mjs`), decision verbs
(PO-gated, signature-or-chat), fixtures incl. the dogfood case.

- States and demand loop exactly #109: `adoption-required` deterministic for
  missing baselines; staged proposal (map first; hottest contracts next by
  observed traversal where C1/D2 data exists, `estimated`/`unavailable`
  otherwise); exactly one durable decision
  (`approved-scoped | deferred(+expiry/review) | partial`); re-raise only on
  expiry/material delta; work in undecided scope requires the decision (a
  deferral suffices) before implementation authority.
- **Artifact orientation (#109 §5).** Adoption produces machine-consumable
  artifacts first — the map bundle, contracts, inventory, fitness model — and
  human-facing views are derived from them. A proposal that would produce
  human documentation as its primary output, with the machine estate as a
  by-product, is the wrong shape: it reproduces exactly the human-first
  default the standard exists to replace.
- Backfill safety: generated maps/contracts carry
  `{coverageClass, confidence}` and cannot `pass` (§2.2); #99 semantics for
  present-state acceptance.
- **Dogfood:** this repository runs the full flow (inventory across the
  ~60-script/471-suite estate, priced proposal, PO decision) as E2 evidence.

## 8. Track E — Integration

**E1** per §3. **E2:** one exact candidate; qualification matrix = #108's
integrated-outcome list (11 points) + the two 2026-08-27 incident classes
(closed-evidence drift detected-at-active-read + repaired via A5 verbs;
writer/observer conformance green) + per-issue acceptance walkthrough +
documentation acceptance; member-issue closing comments and sprint close
per #108.

### 8.1 E3 — provider-free cross-runner AGY Goldfish dispatch spike

**Purpose and boundary.** E3 adds exactly one production caller, planned as
`plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`, between a
runner-neutral `pipeline.role-dispatch-request.v1` Goldfish packet and
`invokeAgy`. It is not a second dispatch protocol and it may not call a real
provider in this package. Every test supplies a fake executable; no test or
normal E3 invocation authenticates, reads provider credentials, or sends a
model request.

**Precondition.** A1 has a current measured Antigravity row, A2 has a
placement row for this caller, A3's protected baseline covers the new host
and receipt surfaces, and A5 repair verbs are actually PO-authorized and
CAS-bound. A missing or `unknown` precondition refuses this route; an
`agy plugins list` result is neither an input nor evidence of plugin loading.
The canonical readback is
`policies/alfred-e3-gate-readback.v1.json`: it names the A1 record, A2 table,
A3 baseline, and A5 authority/write surface together with their candidate
bindings. Its shipped `unavailable` state is a refusal, not a pending green
or a native-runner claim; only a later candidate-bound current readback may
open the fixture seam.

**Caller contract.** The caller accepts only a fully prepared
`transport: "antigravity"`, `role: "pipeline-core:goldfish-*"` packet and
passes that unchanged to the existing preflight and `invokeAgy` boundary. It
binds the exact candidate commit/tree, required-path digests, dispatch id and
a coordinator-owned unique result destination before its single spawn. A
child may return bytes only to that isolated destination; duplicate,
traversal, stale-input, candidate drift, or an occupied result path refuses
before a spawn. Its normalized terminal receipt retains the dispatch binding,
observed/requested model identity, launcher/model-call count, and the typed
AGY result (`AGY-OUTPUT-MALFORMED`, `AGY-MODEL-MISMATCH`, `AGY-TIMEOUT`, or
typed cancellation). Timeout/cancellation is recorded as an unsuccessful
dispatch, never converted into success by a partial result; C1 consumes it as
an interruption receipt only where the C1 emitter is available, otherwise the
receipt says `unavailable`.

**Measured repository start.** Before a fixture spawn the caller runs a
repo-rooted discovery/probe that resolves `.agents/plugins.json`, the local
Pipeline plugin and its Antigravity hook manifest, then captures the
Antigravity `pipeline-start` marker/handshake emitted by the injected
executable. The receipt carries the probe input and output digests plus a
status of `measured | unavailable | refused`. Configuration discovery alone
is not `measured`; the external CLI's plugin listing is expressly excluded.
The fixture proves only that this seam observes the marker contract. The
separate live-pilot gate below is required to assert that a real AGY process
loaded the plugin or executed native hooks.

**Postcondition.** A green E3 result proves deterministic packet-to-boundary
behavior and its fake-executable receipt, not Antigravity enforcement,
sandbox containment, authentication readiness, provider availability, or
three-runner conformance. It adds no authority: A2 determines the actual
control placement, A3/A5 protect the new records, and A1 remains the sole
source of runner-execution truth.

**Fixture floor.** Verify-registered executable fixtures cover: successful
bound dispatch; malformed JSON; requested/observed model mismatch; timeout;
explicit cancellation; plugin marker absent or mismatched; and result-path
collision/traversal. Each failure records its typed code and has zero false
success receipts. A future live pilot is a distinct PO-authorized task with
explicit provider scope, model, sandbox expectation, time limit, no-write
task, output redaction, and signed/read-back evidence; it is not released by
this spike.

## 9. Schema registry (new in Alfred)

| Schema id | Owner | Notes |
|---|---|---|
| `pipeline.alfred-contract-freeze.v1` | E1 | append-only `revisions[]` |
| `pipeline.enforcement-conformance.v1` | A1 | per `{runner, layer}` |
| `pipeline.control-placement.v1` | A2 | `enforcedBy` enum §2.3 |
| `pipeline.protected-baseline.v1` | A3 | static + dynamic classes |
| `pipeline.closed-evidence-repair.v1` | A5 | restore/repin plans + audit |
| `pipeline.rigor-derivation.v1` | B1 | + registry file |
| `pipeline.briefed-test-authorization.v1` | B2-i | target+briefing+expiry |
| `pipeline.verify-suite-registration.v1` | B2-ii | + invariant/non-overlap |
| `pipeline.interruption-receipt.v1` / `-registry.v1` | C1 | #103 fields |
| `pipeline.dispatch-closing-allowance.v1` | C2 | structured handover |
| `pipeline.cross-runner-dispatch-receipt.v1` | E3 | planned fake-executable receipt; live-pilot evidence is separate |
| `pipeline.architecture-decision.v1` | D1 | ADR sidecar |
| `pipeline.architecture-profile.v1` | D2 | + OKF pin fields |
| `pipeline.module-inventory.v1` | D2 | provisional flag |
| `pipeline.module-interaction-receipt.v1` | D2 | §2.1 status per metric |
| `pipeline.fitness-evidence.v1` | D3 | outcome enum §2.2 |
| `pipeline.architecture-baseline.v1` | D3 | ratchet store |
| `pipeline.adoption-state.v1` / `-proposal.v1` | D4 | #109 states |

All closed records per §2; all evidence candidate-bound per Nova §2.2.

## 10. Security and authority boundaries

- Human root of authority: every override/exception/adoption/custom-profile/
  trust-anchor/repair act is PO-performed via the existing signature-or-chat
  ceremony duality (`gates.push_approval`); agents prepare plans and
  evidence only. No Alfred artifact grants an agent a new mutation right;
  the sprint only adds refusals, measurements, and PO-executable routes.
- No secrets/private paths/transcripts in receipts, proposals, or evidence
  (each schema names its sanitization rule); public evidence sanitizes org
  coordinates (#99/#109).
- E3 runs no live `agy` request in Alfred: the executable is injected and
  provider-free. Its process sandbox flag and plugin discovery are evidence
  inputs, never proofs of native containment or hook firing. Any live pilot
  needs a separately scoped PO approval and must read back its measured start
  and plugin evidence before it can affect A1/A2 claims.
- The A1 probe deliberately attempts guard-refused shapes: probe fixtures
  run in disposable fixture repos, never against live protected files; the
  payload-indirection probe writes only to `scratch/`.
- Residual accepted gaps stay visible: `git push --no-verify` (PO-accepted
  2026-08-27), post-hoc-only rows in the A2 table, `prose` declarations.
- **Boundary against #107 (moved to Batman, PO decision 2026-08-28):** two of
  B2's typed routes (B2-i briefed test-change authorization, B2-iv per-key
  trust-on-first-use anchors) add *human authority surfaces*. They stay
  strictly inside the existing signature-or-chat ceremony duality and
  introduce no identity provider, no account model, and no multi-user
  authorization tier — that is #107's scope, and it is not Alfred's.

## 11. Compatibility and migration

- Existing `project/guard-config.json` continues to work; A3 ships a
  readback showing the merged effective set; no project file is rewritten
  without the migration readback.
- Existing governed repos: D-track is baseline-and-ratchet by construction;
  the only new *demand* is D4's one-time decision. This repo dogfoods first.
- Runner differences are data (A1 records), not code forks; Antigravity's
  measured subagent-hook behavior simply yields a different conformance
  record and possibly more `runner-hook` placements.
- Rebase risk (PRD A-1): wave 0 re-runs A1 + the A5 conformance suite
  against the post-Nova base before any Alfred change lands.

## 12. Verification approach

- Every WP lands with its suites registered through the B2-ii registration
  file (which itself lands in wave 1 — until then, the legacy TP-3 ceremony
  batches registrations per block, made predictable by B2-ii's design).
- Fixture-driven, injectable adapters throughout (house pattern:
  `_testGitOperations`-style injection); no live-network tests.
- E3 adds the fixture floor in §8.1 and a direct document/receipt
  reconciliation check. Its fake executable is the only executable permitted
  by this work package; a real AGY invocation is a failing test shape.
- The 21-fixture list of #106, the 14-fixture list of #105, the #101/#102
  lists, **#104's and #109's own fixture lists**, and the four C1 seed
  classes are the minimum fixture inventory; `acceptance.md` maps each to its
  suite. Named explicitly among them because they pin the doctrine's own
  promises: the misleading tiny-module optimization fixture (#104,
  anti-fragmentation), the token-ADR-that-does-not-match fixture (#99 §7,
  semantic conformance), and #109's adoption-state fixtures including the
  dogfood case.
- E2 runs full Verify + security gate + Critic reviews per block (house
  rules unchanged); the sprint adds no bypass of any existing gate.
- **Design-phase review duty (PO constraint, `design/po-input-2026-08-27.md`
  item 3):** every design document of this epic — the `design/*.md` intake
  set, the PRD, this specification, `acceptance.md` — receives at least one
  independent Critic round before PO review, with fail-then-fix cycles
  documented under `evidence/critic/` and re-review rounds bounded by
  `templates/prompts/critic-review.md` (at most four rounds per package).
  §13's wave-completion predicate extends the same bar to implementation
  deliverables.

## 13. Readiness and completion predicates

- **Implementation-authorized:** PRD/Spec PO-accepted; submission/approval
  bound to the complete current package; phase `implementation`; Nova rebase
  done; #100 resolved per PO decision (PRD §9.3). E1 is the first authorized
  foundation act and is not a prerequisite for the authority that permits it.
- **Work-package implementation-ready:** implementation authorized and E1
  freeze artifact committed with the required family/revision bindings. Every
  dependent WP waits for this predicate; E1 itself does not depend on its own
  output. A valid, pinned E1 artifact already present on the inherited
  baseline may satisfy the foundation requirement without recreating it.
  A stale or mismatched freeze does not. These are sequencing predicates,
  not an additional ordinary PO approval.
- **Wave-complete:** each wave's WPs green in Verify + Critic-reviewed with
  documented fail-then-fix cycles; PO-visible wave summary.
- **E3-complete:** every §8.1 fixture is green on one candidate, the receipt
  binds the candidate/input/result/probe evidence, and the precondition
  readback for A1/A2/A3/A5 is current. This does not certify a live runner;
  only the separately approved pilot can make that claim.
- **Epic-complete:** PRD §7 list; every S1–S10 evidenced on one exact
  candidate; all member issues + in-scope backlog items closed or
  re-triaged PO-visibly; sprint close comment per #108.

## 14. Traceability

PRD §4 tracks ↔ this spec §4–§8 one-to-one; issue/backlog mapping in the
intake docs is normative for "which requirement lives where"; acceptance
mapping in [`acceptance.md`](acceptance.md). The architecture doctrine
(`design/agent-first-architecture.md`) ↔ §7: doctrine §2 → §7.2 property
catalog and signals; §3 → §7.2 estate, frontmatter fields, reading order,
derived views; §4 → §7.3 invariant, fitness model, mapping table, promotion
pathway; §5 → §7.2 active optimization and §7.4 artifact orientation; §6 →
§7.1 brownfield decision-estate migration and §7.4 adoption states.

## 15. Rejected alternatives

1. **Re-registering all guards as subagent-reaching runner hooks** (betting
   on the documented behavior): rejected — measured false today on the
   primary runner; A1 lets the design profit automatically if it becomes
   true.
2. **OS-level sandboxing for the payload-indirection gap:** rejected by PO
   (2026-08-27) — outside the threat model; residual gap stays visible.
3. **A second close machinery for architecture impact (#99 §6):** rejected —
   `ritualExtensions.close.pre` extension point suffices; no parallel
   lifecycle.
4. **A numeric universal risk score for B1:** rejected by #105 itself;
   derivation returns classes and named triggers, never one scalar.
5. **Building org policy-pack resolution inside Alfred:** rejected — #9 owns
   it; Alfred consumes its interface and reports typed absence.
6. **Auto-repair of drifted closed evidence:** rejected — repair is PO-gated
   by construction; an agent-auto-repair would be the same class of silent
   authority mutation this sprint exists to end.
7. **Postponing C1 to a later wave:** rejected — collecting useful calibration
   evidence early remains necessary for threshold-dependent promotion. The
   PO decision of 2026-09-13 removes the former fixed 14-day wait, not the
   evidence-quality requirement or explicit promotion decision.
8. **One merged property list for #104 and #106** (collapsing the nine
   declared properties and the ten evaluated classes into a single
   enumeration): rejected — declaration and evaluation are distinct views of
   the same architecture and are deliberately not 1:1. A merged list would
   force each declared property to have exactly one mechanical evaluator,
   which is false for context locality (signal-only until calibration) and
   for module identity (a foundation whose parents are all nine, not one).
   They stay separate, joined by the explicit mapping table in §7.3.

## 16. 0.7 greenfield remediation increment

The 2026-09-27 three-runner acceptance findings are integrated through
[`design/greenfield-0.7-remediation-2026-09-27.md`](design/greenfield-0.7-remediation-2026-09-27.md).
Its five slices fix or explicitly resolve significant delivery blockers,
security gaps, evidence defects, and measured usability costs before a new
local 0.7 candidate is offered for installation. Each backlog item's own
acceptance remains authoritative; the addendum owns implementation ordering,
non-overlapping file responsibilities, and the candidate evidence matrix.

The security and Advisor deadlock slices precede candidate qualification.
Source fixtures and a clean checkout cannot substitute for the stated live
Codex/WSL, Claude/Windows, and version-correct Antigravity readbacks. The
Reader terminal course closes after its fourth correction without a fifth
review; a source release pass requires a distinct truthful terminal binding
contract. Any item not satisfied on the exact candidate remains visible as an
open release impact or needs an explicit PO-visible disposition. No backlog
status or sprint assignment is silently changed by this section.

## 17. 0.7 design-workflow authority and acceptance

The final design-workflow package has five independently hashed current
sources: the preserved original input, PRD, Spec, final design and
traceability. Its closed metadata binds candidate commit/tree, Advisor demand
and route-selection evidence, answer receipt plus Elephant disposition or a
proposed scoped exception, and one independent readiness receipt. A package
builder may prepare this before approval but cannot set implementation
authority. Any material change to a source, route policy, demand, disposition
or final design invalidates the affected evidence and requires fresh readiness
before presentation.

Readiness is a fresh comparison by an independent read-only reviewer. The
host creates a new session without coordinator chat, handover, prior answers
or memory, and independently observes its start, completion and permitted
effects. The host-only execution evidence binds the same dispatch, candidate,
five source hashes, requested route and exact report digest. It names the
isolation mechanism actually used and records the observed profile/tool
admission and terminal state; a model-authored claim of freshness or read-only
behavior cannot satisfy these facts. Host attestation must be read back from
the private immutable execution store and survive an identical second read.

For the Codex tool-free structured host route, all five complete source
contents are delivered as a bounded, digest-validated untrusted evidence
bundle. The host disables inherited MCP/plugin tools, hooks, commands,
environment access and external tool surfaces before the turn, and verifies
the exact fresh thread's profile and tool inventory. An unexpected tool item
or server request fails the duty. Credentials stay at the host authentication
boundary and are never copied or linked into model-readable scratch. A
standalone host process must have registered ownership, bounded shutdown and
restart recovery before launch. This route requires its own truthful private
host observation; it cannot claim the selected-sandbox assurance of another
transport. Freshness, denied outside reads, denied writes, suppressed inherited
tools, stale/replayed receipt rejection and interrupted-child cleanup each
have positive/negative fixtures and live Codex readback. The common validator
rejects missing or forged execution facts before implementation authority.

The Advisor host admits repository consent, export permission and route
capability before constructing or sending a question. Claude tries a native
Advisor and, after a typed failure, its governed fresh read-only consult
fallback. Codex and Antigravity use the ordinary fresh consult route. Every
answered receipt binds the exact demand, question/evidence hashes, candidate,
selected route and observed dispatch/result; a model name or agent assertion
is not execution, provider or OS attestation. Each failed applicable route
records phase, typed reason and child-start fact. The no-child case never
claims an answer. A proposed unavailable exception needs valid failure and
route-attempt evidence and remains non-authorizing until the final PO decision.

One pure package validator checks closed shapes, source bytes, digests,
candidate and receipt provenance. One common implementation-authority
predicate checks the validated package, independent readiness outcome and the
single final approved-package readback. The transition writer and all three
runner entrypoints call that predicate. Each entrypoint has positive and
negative invocation tests for missing, forged, stale, mismatched, failed and
replayed evidence; a pure validator unit test does not replace entrypoint
coverage. Approval is atomic with exact package-digest readback and preserves
authority only while the governed scope remains unchanged.

The agent submits the plan and presents the complete package autonomously;
neither mechanical act requires PO permission, a content acknowledgement or
a signature. The sanctioned plan approval is the single ordinary PO
final-package decision in either configured chat or signature mode. Both
modes bind the same closed bytes, readiness and any Advisor exception, and
reject stale or replayed approvals. Historical PRD/Spec acknowledgements and
exact protected-file write signatures retain their original limited scope;
they cannot satisfy this final decision or become an additional submission
gate. No separate ordinary Advisor or implementation approval is added. Host
export denial is final for that attempt; no alternate egress is silently tried.

Reserve at most one durable Advisor consultation cycle per design course;
registry-bounded fallback attempts are inside it. Dispatch changes, packaging,
readiness corrections and restarts never reset that budget. A materially new
substantive question requires an explicit new-course owner decision and prior
course linkage. Preserve the genuine initial candidate, canonical question,
evidence, actual answer and proposal disposition. Independently verify an
ordered committed revision chain to the final five sources; never relabel an
initial receipt to the final revised candidate. Final independent readiness
and PO approval bind that final candidate and complete versioned package.

Before Full Verify, a fresh independent Critic must review the frozen
candidate; a changed candidate invalidates both Critic and Verify evidence.
Qualification records the installed plugin identity separately for Codex,
Claude and Antigravity and does not infer it from source HEAD. The 0.7 release
preflight checks all open greenfield blocker, security, quality and efficiency
items against their own acceptance evidence. Unresolved impact remains visible
to the PO; no install or publication occurs as a side effect of source checks.

## 18. Repository activation, source topology and uninstall contract

Freeze a shared bounded read-only activation observer and sanctioned writer before hook migration. Closed metadata binds physical scope, state, enrollment/decline provenance and source observations. `active` requires validated enrollment, never an arbitrary marker union. Durable decline overrides retained authority/documents and survives private-state removal; absent enrollment has no Pipeline side effects. Malformed proven-active authority stays governed and fails through typed recovery rather than becoming an ungoverned bypass. Git common/worktree and non-Git decline semantics are explicit and tested.

Every hook and nested Pipeline effect producer checks activation before role/input/lifecycle enforcement, telemetry or bootstrap. Inactive/declined ordinary operations exit silently without files or HOME/private stores. Always-on destructive Git protection is separated from active-only GIT-03/publication conventions. Its foreign-repository denials do not initialize Pipeline HGO state. Wiring-enumerated tests cover all three runners, declined restart, retained documents, unsupported roots and active positive controls.

A shared Antigravity topology observer reports bounded physical managed/imported/global/workspace and external Pipeline hook identities with explicit errors. Source fixtures, isolated CLI precedence facts and live executed-source readback are separate assurance classes. A host-owned convergent refresh binds a concrete approved-source/topology plan and preserves unrelated configuration. No global cleanup follows implicitly from a per-project operation.

Uninstall derives ownership/footprint independently from existing authority/projection/hook records and uses a digest-bound resumable journal. Remove owned Git shims before implementation/private state; strip exact owned keys; unregister exact workspace mechanics; persist decline; archive/remove admissible private state last. Foreign/modified/shared-worktree artifacts are preserved or yield explicit conflict. Readback checks executable bindings rather than banning textual plugin references in retained content. Kept digests, local hook-active Git commit/push, fault-boundary resume, re-onboarding and stale-cache-hook fixtures are required.

The implementation sequence, exclusive ownership and complete acceptance matrix are defined directly in the canonical `design/greenfield-0.7-remediation-2026-09-27.md`, sections Repository activation/source topology/uninstall and Frozen activation design decisions. The additional-scope file is a preparation mirror, not a sixth authority source required for the five-source review. Schema mirrors, static closure and registered probes join the full existing 0.7 candidate checks. Source test success does not qualify an installed runner.

## 19. Canonical signing transport and historical withdrawal

The canonical closed design-workflow approval request carries its digest at `approvalIntent.sha256`; signing that transport preserves the full default current-package validator, bounded disclosure, exactly one attended confirmation and key-access ordering. A malformed nested digest cannot fall back to a top-level alias. Stale sources, mismatched request/package digests, unknown keys and absent/failed readiness refuse signing. A fixture with synthetic readiness authority is labelled as such and cannot attest a native model review.

Historical exact v1 cancellation receipts remain valid. Withdrawal of a different current submission creates a closed v2 chain retaining the previous receipt, with bounded count/UTF-8 size, same-feature identity, unique submission digests and chronological ordering. Exact latest completed replay is zero-write. Stale submission names, malformed or over-capacity history refuse before mutation. Canonical writer lock/CAS/readback tests exercise two successive submissions and retained historical data. An older installed decoder is not upgraded by a source test; controlled refresh compatibility and installed readback remain required. Slice B owns these two confirmed source items and their acceptance.

## 20. Recovery availability when the in-session verifier is unavailable

This bounded design amendment is sourced from the latest user requirement
and sanitized Toolbox handover in
[`design/recovery-availability-2026-10-03.md`](design/recovery-availability-2026-10-03.md).
The handover is narrative with shortened digests and no complete argv/raw
JSON; it is not verified live output. Existing full Alfred scope remains
binding. No approval, implementation authority, source fix or installed-host
result is implied.

### 20.1 Recovery levels and authority boundary

1. **Intrinsic known-shape repair:** retain narrow diagnosis and writers such
   as ADR-0082 continuity repair. A plan binds diagnosis, immutable preimage
   and exact postimage, then uses lock/CAS and complete readback. Ambiguity,
   missing evidence and unrelated corruption remain refused.
2. **In-session maintenance:** use existing GMW/HGO only within existing
   scope while the verifier, repository identity, proof and bounded expiry
   can be validated. This amendment does not expand GMW, lift its kernel, or
   let an in-session verifier authorize its own replacement.
3. **Attended external recovery (proposed):** independently establish a
   known-good verifier/source outside the broken runner. The current design
   specifies a pinned standalone Node CLI using built-ins only, an attended
   operator-selected external artifact and public signer anchor, configured
   detached human Ed25519 authorization, owner-private preimages, exact
   bounded Pipeline code/test paths, lock/CAS and forward recovery. State,
   runtime-private evidence, proofs, trust anchors and unrelated plugin
   configuration are excluded and remain with their sanctioned writers.

Unknown owner, missing proof/key/source trust, ambiguous bytes, or unsupported
host layout produces typed unavailable with the concrete attended
prerequisite. No route may report ready, guess that an owner is dead, invent
proof, or end in an unexplained `nobody` dead end. Lost bytes and secrets are
not recoverable by inference.

### 20.2 P1 legacy-owner archival requirements

The Toolbox handover reports a Windows hard crash during Verify-evidence push
preparation, one orphan descriptor, unavailable owner and a PO CAS conflict.
This report does not establish process liveness or receipt validity. The
source diagnosis is that the current V2 descriptor creator stores
`ownerRuntime: null` when process-start identity is unavailable; its current
identity helper is Linux-only. V2 null is observed as `unavailable`. Legacy
V1 descriptors have the field absent and are observed as `unobserved`. Neither
status means `not-live`, and neither supports retroactive reboot inference.
The handover supplies no raw descriptor JSON, so that descriptor's schema is
unknown. New native owner observation and legacy signed custody are separate
mechanisms.

Before a CAS conflict can be classified, collect bounded sanitized
status/schema/digest data and matching compare flags. Do not presume a
truncated receipt or authentic stale receipt. After affected sessions have
ended, a separately signed, attended legacy-custody transaction binds the
physical repository and target, observed bytes or explicit absence, receipt
classification/schema, exact digests/comparison, session-ended confirmation,
action/disposition, archive destination where applicable, expiry and CAS
precondition. Its disposition matrix is:

| Receipt observation | Permitted signed disposition |
| --- | --- |
| Valid and matching | Preserve exact bytes and metadata. Replay an existing action only when its actual full replay preconditions verify; otherwise use new explicit signed custody authority. |
| Valid but conflicting or stale | Archive/quarantine exact bytes under a signed disposition binding compared digests and conflict; the old receipt grants no authority. |
| Absent | Bind exact absence and CAS precondition; never fabricate bytes. New explicit signed custody authority may proceed where other prerequisites hold. |
| Malformed or explicitly invalid, with bounded readable bytes | Archive/quarantine only exact observed bytes under a signed disposition binding digest and independent comparison/classification; the old receipt grants no authority. |
| Unreadable, symlinked, or physically ambiguous | Return typed unavailable with the concrete read/identity prerequisite; do not mutate or guess. |

Archive preserves original receipt bytes and records a separate disposition;
it never deletes/rewrites history, asserts unsupported `not-live`, or modifies
State, `activeFeature`, proofs, history or resources. Archived conflicting,
stale, invalid or malformed receipts confer no authority. A valid matching
receipt permits only its existing exact replay when all actual replay
preconditions hold; otherwise new explicit signed custody authority is
required. Missing or invalid human signer proof is a separate authorization
failure and prevents every mutation. Required consumer instructions must be signed and state exact
inputs, host prerequisites, readback, session-ended confirmation, receipt
class, preservation destination/digest, proof subject, CAS precondition and
stop conditions.

### 20.3 Required acceptance evidence

The proposed recovery path is acceptable only after implementation and
candidate-bound evidence demonstrate:

- V2 `ownerRuntime: null` is `unavailable`, V1 field-absent is `unobserved`,
  and neither becomes `not-live`; a new native observer reports live/dead only
  where platform evidence supports it and never retroactively infers reboot;
- CAS-conflict classification requires matching bounded status/schema/digest
  and compare flags; mismatch or ambiguity preserves bytes and returns typed
  unavailable;
- detached human proof binds exact receipt bytes or explicit absence,
  repository, classification/comparison, disposition, session-ended
  confirmation and CAS precondition;
- valid matching receipts preserve exact bytes/metadata and replay only with
  full actual replay preconditions; valid conflicting/stale and bounded
  readable invalid/malformed receipts archive only by signed disposition;
  absent receipts bind absence without fabrication; unreadable/symlinked/
  ambiguous targets return typed unavailable;
- archive readback preserves exact original bytes and grants no authority to
  archived receipts; missing/invalid signer proof, wrong repo, receipt drift,
  concurrent writer, symlink target and interrupted archive refuse safely;
- Pipeline State, `activeFeature`, proofs and history remain byte-for-byte
  unchanged across archival; crash recovery is forward-only and preserves
  intervening changes;
- every new refusal path has observed positive/negative fixtures and an
  explicit recovery/handoff disposition; CI wiring detects an unregistered
  producer, while runtime unknowns return an attended diagnostic handoff.

R1–R5 and B2 from the handover remain reported findings, not accepted backlog
changes. Resolve P1 first; source-confirm minor items before changing scope.
R2 (`windows-acl` phase) and R3 (per-build stale pre-push evidence) are
expressly unconfirmed. Do not claim their defects or fixes without real
source/runtime evidence. Host/platform evidence, implementation, independent
review, Verify, and PO disposition remain open.

## 21. 2026-10-03 findings round: three-runner happy path

Source of findings, verdicts and code references:
[`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md)
(the register; IDs K1-1 … K8-4). Only `confirmed` and `partially` rows are
in scope, and they carry the register's verdict wording. Rows marked
`not determinable from source` (K7-8) get a reproduction step, not a fix. This
section is additive. It does not relax §§1–20 and grants no implementation
authority.

**Governing requirement (PO, 2026-10-03):** on the happy path, Claude (native
Windows and POSIX), Codex and Antigravity each complete onboarding, design,
Advisor, plan approval, implementation and push without guard overrides,
recovery ceremonies or repeated signatures. The PO is asked exactly twice: the
final plan approval and the push approval. A signature-mode push of any
branch, including a feature-branch checkpoint, requires a signed approval bound
to the exact commit.

### 21.1 R1 — Lifecycle-command admission (K1-x, K1-1…K1-7, K4-3, K7-1, K7-2)

Contract:

- Every command the Pipeline itself emits as `nextAction`, recovery action or
  documented course step is admitted in every lifecycle phase that emits it.
  The guard derives admission from one shared registry of closed argv shapes,
  the same registry the emitters render from, never from a separately
  maintained allowlist. This covers `continuity-cas`, `continuity-integrate-final`,
  `cancel-submitted-plan`, `design-course-session` stages,
  `guard-human-override.mjs` agent-side steps (`plan`, `prepare-authorization`,
  `prepare-for-signature`, `refreeze-plan`, `emit-signature-digest`,
  `authorize-by-signature`), `check-observation-governance.mjs`,
  `pipeline-start-preflight.mjs` and `project-onboarding-v3.mjs inspect` for
  every intent.
- Script paths are compared after normalisation: drive letter case,
  backslash and forward slash, MSYS `/d/...`, repository-relative and absolute,
  and the documented `${PIPELINE_PLUGIN_ROOT}` placeholder resolved against the
  verified plugin root. Unknown spellings stay refused.
- A read-only script under `scratch/` is classified as read-only execution
  when its argv carries no write target and the script is not a known
  writer. A typed denial names the reason instead of the generic opaque lane.
- `git stash list` and `git stash show [<stash>]` are read-only. Denials name
  the real target operand, never a subcommand word.
- Onboarding scaffold paths (`.gitignore`, `AGENTS.md`, `architecture/`,
  `pipeline.user.yaml`, `project/`) are committable in every phase, or
  onboarding commits them itself. Configuration read from `HEAD`
  (`resolveV3DutyRoute`) never depends on a commit the current phase refuses.
- The governed repair a typed recovery prescribes (for example F6 inventory
  classification under `governance/`) is reachable without a guard override.
- `pipeline-start` documents every preflight status, including
  `hook-provisioning-required`, with its action.

Acceptance cases:

- R1-1 A consistency test enumerates every emitted `nextAction`/recovery argv
  across lifecycle phases and asserts guard admission for each, on win32 and
  POSIX command dialects.
- R1-2 A greenfield design course in `draft` reaches `present-plan` with zero
  guard overrides (Claude/Windows Git Bash fixture and POSIX fixture).
- R1-3 Preflight admitted for backslash, forward-slash, MSYS and placeholder
  spellings; refused for a different script with the same basename.
- R1-4 `node scratch/<read-only>.mjs` admitted; `node scratch/<writer>.mjs` that
  writes outside `scratch/` refused with a typed reason.
- R1-5 `git stash list` admitted in draft; `git stash pop` refused.
- R1-6 Scaffold commit in draft admitted; production path commit in draft refused.

### 21.2 R2 — Read policy (K2-1…K2-5, K7-3 read part)

Contract:

- `isAllowedPassiveReadTarget` evaluates each auxiliary root independently. An
  unusable root is skipped and reported, and never fails an otherwise admitted
  target. Session roots are derived with the same realpath implementation the
  policy compares with (`realpathSync.native`). On win32, path identity
  comparison is case-insensitive.
- Windows UNC paths to WSL (`\\wsl.localhost\<distro>\...`, `\\wsl$\...`) are
  user-visible host paths for exact-file reads. Credential roots stay denied
  through every spelling.
- Native Grep admits in-repo directories and `glob`/`type` filters within the
  project root. Native Glob admits wildcard patterns within the project root.
  Read-only `rg` flags (`-A/-B/-C`, `--glob`) are admitted on in-root targets.
- `git <read-only> ... | head -n N` treats revision arguments (`<rev>:<path>`,
  `HEAD~N`) as revisions, not filesystem paths. Every grammar example printed in
  refusal text is covered by an admission test.
- Denial texts name the guard code and the real cause. They never say "outside
  the project root" for an in-root target, and never imply absence.

Acceptance cases:

- R2-1 Windows fixture: a transcript-directory case mismatch between runner
  input and disk does not refuse in-root Read, Grep, Glob or `head`.
- R2-2 UNC WSL exact-file Read admitted; UNC credential path refused.
- R2-3 Grep directory, Grep `glob`, Glob `**/*.md`, `rg -A2 --glob` admitted in
  root; the same shapes targeting `~/.ssh` refused.
- R2-4 `git show HEAD:docs/state.md | head -n 5` admitted; every printed grammar
  example passes its admission test.
- R2-5 Refusal-text audit test: no in-root target yields
  `GUARD-READ-SCOPE-OUTSIDE-ROOT`.

### 21.3 R3 — Authorization ceremonies (K4-1…K4-6b, K6-1…K6-3)

Contract:

- The happy path issues exactly two PO decisions: final plan approval
  (design-workflow package plus plan approval as one signed act) and push
  approval. Bootstrap plan acknowledgement, onboarding confirmations and key
  setup are folded into these or removed from the happy path. Each that
  remains is listed with its reason in the ceremony inventory test.
- In signature mode every push requires a signed approval bound to the exact
  commit, remote and destination, including `feature-checkpoint` pushes. A
  checkpoint push keeps its slim prerequisite set (no Verify, security or
  Critic chain); release/main promotion keeps the full chain. The pre-push hook
  enforces the same rule, including Ed25519 proof verification, so an unsigned
  push outside the session guard is refused.
- Guard-override retries match an armed capability on the governed action
  (tool, `toolInputSha256`, denials, policy). They do not match on unrelated
  working-tree state: untracked files and Pipeline-owned writes outside the
  governed target do not drift the capability. Drift that does refuse names
  the drifted inputs.
- Signing intents work in an unborn-HEAD repository.
- All agent-side preparation runs in-session. The PO receives one single-line
  signing command per decision and never copies JSON back. PO copy commands
  never use backslash line continuation.
- A PO-signed configuration override is a durable layer that migrations
  respect, or the override route is refused up front with the correct
  alternative.

Acceptance cases:

- R3-1 Ceremony inventory test per runner: onboarding → push yields exactly
  two PO proofs in signature mode, and the same two confirmations in chat mode.
- R3-2 Signature-mode checkpoint push without approval refused by session
  guard and by pre-push hook; with an exact-commit signed approval admitted.
- R3-3 Arm → unrelated untracked file created → identical retry consumes the
  capability; arm → governed target changed → refused with named drift.
- R3-4 Unborn-HEAD signing intent builds and verifies.
- R3-5 Rendered PO commands contain no line continuation and fit the
  documented column bound.

### 21.4 R4 — Runner parity and role routes (K3-1…K3-9, K7-4, K7-5)

Contract:

- A typed, read-only role-route preflight reports, per runner and role
  (Advisor, Critic, Goldfish tiers, readiness), `native` or
  `fallback-self-dispatch` with a reason code. On `fallback-self-dispatch` the
  agent dispatches the canonical role template through its native subagent
  mechanism. The course accepts the result as that role's evidence with an
  assurance label recording the fallback. Independence (fresh context,
  read-only Critic/Advisor) and template-only briefings remain mandatory.
- Producer failures surface stderr text (bounded, sanitized) and exit code.
- Antigravity defaults make every duty that profile `feature` requires
  available or fallback-routed. Native subagents receive a bootstrap path they
  can satisfy. Bootstrap-lock freshness is bound to the session, not a fixed
  30-minute mtime window.
- Claude: the dispatch guard accepts built-in agent types (`Explore`, `Plan`,
  `general-purpose`) and runs Advisor-prohibition parsing only when the line is
  present. The dispatch-budget counter lock works on native Windows and macOS
  with the same live/dead/ambiguous semantics. Goldfish/Critic templates state
  the bootstrap-receipt step and its admitted spelling.
- Codex: native host commit requirements (marker, role, `worker` type) are
  stated in the briefing template and checked before dispatch. An ineligible
  dispatch is reported, never silently `NGHS-NOT-APPLICABLE`.
- SessionStart hints are runner-specific. A Claude session never receives
  Codex transcript instructions.

Acceptance cases:

- R4-1 Route preflight fixtures per runner, covering both outcomes.
- R4-2 Fallback Advisor/Critic results accepted by the course with the
  fallback assurance label; a self-review attempt is refused.
- R4-3 Antigravity `feature` profile reaches readiness and Critic; a subagent
  completes Read/Write after its bootstrap step; a resumed session after more
  than 30 minutes is observed as hard-enforced.
- R4-4 Native-Windows budget-counted subagent completes Read, Write and Bash
  calls under the real hook; `Explore` dispatch admitted.
- R4-5 Codex unmarked dispatch yields a typed pre-dispatch finding.
- R4-6 Claude SessionStart output contains no other runner's name.

### 21.5 R5 — Design-course contract consistency (K5-2…K5-6, K8-3)

Contract:

- One documented, machine-emitted sequence: intake → stage-0 authoring (the
  Elephant authors PRD/Spec/design/traceability under the EL-16 design-phase
  exemption, or dispatches) → binding → Advisor → `submit-plan` → readiness →
  presentation. The authoring dispatch is registrable through an admitted
  command (R1). Generated short forms of role rules do not drop qualifiers
  (EL-16 design-phase exemption).
- One trailer grammar generates obligations, guard admission and authorship
  verification. `Dispatch: design (elephant)` is admitted for design paths in
  design phases and refused for production paths.
- `--answers-file` (with digest) is available wherever `--answers-json` is
  accepted. Intake reuses the onboarding-confirmed language without asking
  again.
- The design course fixes an executable Verify contract before presentation.
  The design→implementation `collect-input` remains as a backstop.

Acceptance cases:

- R5-1 The course doc/emitter consistency test fails if the documented
  sequence and the inspect-emitted steps diverge.
- R5-2 Every printed commit example passes the installed commit guard and
  commit-msg hook.
- R5-3 A 30 KB answers file is accepted on Windows; the language is asked
  once.
- R5-4 Presentation refused without a configured Verify contract.

### 21.6 R6 — Forensics and audit chain (K8-1, K8-2, K8-4, K7-6, K7-7)

Contract:

- The project-bound transcript reader supports Claude, Codex and Antigravity,
  merges multi-file segments of one session and child sessions, and reports
  usage only where the host supplies it.
- `inspect` compares continuity PRD/Spec digests with the checkout and
  surfaces drift as an open recovery.
- A new `docs/*.md` cannot be committed unclassified. The observation-governance
  check runs in the pre-commit hook. The handover writer classifies its own
  documents.
- A generated per-change audit index lists source, commit and gate digests and
  names missing steps explicitly.

Acceptance cases:

- R6-1 Multi-segment session fixture readable per runner.
- R6-2 Continuity digest drift fixture reported by `inspect`.
- R6-3 Unclassified `docs/*.md` commit refused by pre-commit.
- R6-4 Audit index generated for a fixture change with one deliberately
  missing gate.

### 21.7 Sequencing and completion

R1 and R2 come first. They block the design course and every runner, so no
other workstream can be validated end to end without them. R4's Windows
budget-lock and route preflight follow, because Goldfish dispatch on Windows
depends on them. R3, R5 and R6 can then proceed in parallel slices. The round
is complete only when the three-runner end-to-end scenarios required above
pass on the stamped local candidate. Each runner has its own host evidence;
source fixtures do not substitute for native runner observations. Independent
Critic review, Verify, security and PO acceptance remain separate gates.
