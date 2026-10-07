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

### 8.2 E4 — native-runner Goldfish host-commit (PO-directed scope extension, 2026-09-27)

**Purpose and boundary.** Claude and Codex direct native Goldfish dispatches may
opt in to the host-owned commit boundary through separate runner-native start
and return bindings. The contract below is the Spec home of PRD §4 Track E E4
and PRD §7.10; its acceptance is AC-25. E4 is local host-observed evidence, not
provider attestation, and it is independent of E3's fake-executable seam.

**Contract.**

- **Binding.** Each runner-native return correlates to exactly one prelaunch
  dispatch, candidate, configured model, role and allowed write scope.
- **Admitted diff.** Only a validated exact final return and its admitted paths
  can be host-committed; the host commits only the validated returned diff.
  Ordinary Git hooks stay enabled.
- **Order.** Exact commit readback, then a private host-observation receipt,
  then the authored v4 record, which is published last.
- **Assurance.** The result is local host-observed evidence. A fresh clone
  without a separately approved signed export remains `UNVERIFIABLE`.
- **No authority without evidence.** A malformed, ambiguous, interrupted or
  missing-evidence case, and any unsupported or ambiguous dispatch shape, has no
  host-commit authority and is never recorded as authored PASS or authored
  success.
- **Codex pre-dispatch check.** Host-commit requirements are stated in the
  briefing template and checked before dispatch; an unmarked Codex Goldfish
  dispatch is refused before launch unless its briefing states
  `Host commit: not-requested (reason: …)` (§21.4 Codex bullet, R4-5).

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

Uninstall derives ownership/footprint independently from existing authority/projection/hook records and uses a digest-bound resumable journal. Remove owned Git shims before implementation/private state; strip exact owned keys; unregister exact workspace mechanics; persist decline; archive/remove admissible private state last. Foreign/modified/shared-worktree artifacts are preserved or yield explicit conflict. Readback checks executable bindings rather than banning textual plugin references in retained content. Kept digests, local hook-active Git commit/push, fault-boundary resume, re-onboarding and stale-cache-hook fixtures are required. An uninstall that meets a foreign Git hook (a hook the Pipeline does not own and cannot prove it installed) keeps refusing: it returns the typed code `PU-FOREIGN-HOOK-CONFLICT` with instructions that name the hook, state that nothing was removed for it, and give the attended step the repository owner takes (PO decision 2026-10-04 #9). Acceptance case U-1: a repository with a foreign hook next to Pipeline-owned bindings refuses the uninstall with `PU-FOREIGN-HOOK-CONFLICT` and those instructions; the foreign hook stays byte-for-byte unchanged, every retained document and the Git history are intact, and ordinary Git commit/push still works. The case runs on the win32 and POSIX dialects and in a consumer-layout repository.

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
3. **Attended external recovery (implemented 0.7.0 deliverable, PO decision
   2026-10-04 #1):** independently establish a known-good verifier/source
   outside the broken runner. This level is delivered completely in 0.7.0 and
   is accepted by RV-8…RV-11 (§20.3). Its contract is stated here in full:
   - **Tool.** A pinned standalone Node CLI that uses Node built-ins only. It
     needs no package install, no network and no part of the broken runner,
     plugin or in-session verifier.
   - **Trust.** The attended operator selects the external artifact (the
     known-good source) and the public signer anchor. Trust originates only
     from that operator-selected anchor, never from the repository under
     repair, the runner session or a model statement. A wrong repository, a
     wrong anchor or an altered artifact is refused before any write.
   - **Authorization.** A detached human Ed25519 authorization bound to the
     repository identity, the exact bounded set of code and test paths it may
     write, and the owner-private preimages of those paths. A path outside the
     signed set is refused.
   - **Preimages.** Owner-private. Each target's current bytes, or its
     explicit absence, are bound before any write; a preimage mismatch refuses
     without mutation.
   - **Application.** A per-file journaled atomic prefix under lock and CAS.
     Each file is written atomically and each step is journaled, so an
     interruption leaves only a recorded prefix. Every written file is read
     back and compared with its exact signed post-image.
   - **Crash recovery.** Forward-only. A re-run resumes the journal to the
     signed post-image or reports typed unavailable; it never rolls back over
     intervening changes and never leaves a partial, unrecorded state.
   - **Exclusions.** State, runtime-private evidence, proofs, trust anchors and
     unrelated plugin configuration are excluded and remain with their
     sanctioned writers.

Unknown owner, missing proof/key/source trust, ambiguous bytes, or unsupported
host layout produces typed unavailable with the concrete attended
prerequisite. No route may report ready, guess that an owner is dead, invent
proof, or end in an unexplained `nobody` dead end. Lost bytes and secrets are
not recoverable by inference. This is the bounded reading of the requirement
"there must always be a repair route" (PO decision 2026-10-04 #15): there is
no dead end; where safe repair is impossible (unknown owner, missing
proof/key/trust, ambiguous bytes) the Pipeline returns a typed result naming
the concrete attended prerequisite, after which the route above applies
(RV-11).

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

Recovery is an implemented epic deliverable, not design-only input. It is owned
by the implementation wave for the remaining Alfred work (tracks A–E and this
section) and is sequenced after R4 (§21.7), because its owner observation needs
the platform sweep. Its acceptance is RV-1…RV-11 below (RV-1…RV-7 cover the P1
legacy-owner custody and archival; RV-8…RV-11 cover the attended external
route of §20.1 level 3); the recovery path is acceptable only after
implementation and candidate-bound evidence demonstrate:

- RV-1: V2 `ownerRuntime: null` is `unavailable`, V1 field-absent is
  `unobserved`, and neither becomes `not-live`; a new native observer reports
  live/dead only where platform evidence supports it and never retroactively
  infers reboot;
- RV-2: CAS-conflict classification requires matching bounded
  status/schema/digest and compare flags; mismatch or ambiguity preserves bytes
  and returns typed unavailable;
- RV-3: detached human proof binds exact receipt bytes or explicit absence,
  repository, classification/comparison, disposition, session-ended
  confirmation and CAS precondition;
- RV-4: valid matching receipts preserve exact bytes/metadata and replay only
  with full actual replay preconditions; valid conflicting/stale and bounded
  readable invalid/malformed receipts archive only by signed disposition;
  absent receipts bind absence without fabrication; unreadable/symlinked/
  ambiguous targets return typed unavailable;
- RV-5: archive readback preserves exact original bytes and grants no authority
  to archived receipts; missing/invalid signer proof, wrong repo, receipt
  drift, concurrent writer, symlink target and interrupted archive refuse
  safely;
- RV-6: Pipeline State, `activeFeature`, proofs and history remain
  byte-for-byte unchanged across archival; crash recovery is forward-only and
  preserves intervening changes;
- RV-7: every new refusal path has observed positive/negative fixtures and an
  explicit recovery/handoff disposition; CI wiring detects an unregistered
  producer, while runtime unknowns return an attended diagnostic handoff;
- RV-8: the attended external CLI verifies the operator-selected signer
  anchor and the detached signature before any write. A wrong repository
  identity, a wrong anchor and an altered external artifact each refuse with a
  typed code and leave every target byte-for-byte unchanged;
- RV-9: the CLI applies exactly the signed bounded code/test paths and refuses
  every other path. A preimage mismatch (bytes or bound absence) refuses
  without mutation. After a full apply, every written file reads back equal to
  its signed post-image, and State, runtime-private evidence, proofs, trust
  anchors and unrelated plugin configuration are unchanged;
- RV-10: an injected crash at every journal step (before the first file,
  between files, after a file and before its journal record, after the last
  file and before the final record) resumes forward on re-run to the signed
  post-image, or reports typed unavailable. It never leaves a partial,
  unrecorded state and never rolls back over intervening changes;
- RV-11: an unknown owner, a missing proof, key or source trust, ambiguous
  bytes and an unsupported host layout each return typed unavailable that names
  the concrete attended prerequisite. No fixture ends in a dead end or an
  unexplained refusal, and after the named prerequisite is supplied the RV-8…RV-10
  route applies (PO decision 2026-10-04 #15 confirms this bounded reading of
  "there must always be a repair route").

R1–R5 and B2 from the handover remain reported findings, not accepted backlog
changes. Resolve P1 first; source-confirm minor items before changing scope.
R2 (`windows-acl` phase) and R3 (per-build stale pre-push evidence) are
expressly unconfirmed. Do not claim their defects or fixes without real
source/runtime evidence. Host/platform evidence, implementation, independent
review, Verify, and PO disposition remain open.

## 21. 2026-10-03 findings round: three-runner happy path

Source of findings, verdicts and code references:
[`design/greenfield-0.7-findings-round-2026-10-03.md`](design/greenfield-0.7-findings-round-2026-10-03.md)
(the register). This section is additive. It does not relax §§1–20 and grants
no implementation authority. It is complete in itself: the workstream headers
below list every register ID exactly once, and `traceability.md` repeats the
same ownership as a map whose mapped-row count equals the register's ID count.
The review findings recorded on 2026-10-03 are applied directly in this text
and in the other four sources. That statement is provenance only: it is not
Advisor or readiness evidence and not an approval.

### 21.0 Scope rule, route decision and governing requirement

**Scope rule.** The register is in scope in full. Every register row is owned
by exactly one workstream (explicit ID lists below) or by the deferred list
(§21.8):

- `confirmed` / `partially` rows get a contract and at least one acceptance
  case.
- Requirement rows get a contract.
- `pending` / `not determinable from source` rows get a reproduction step
  first, and a contract only after the reproduction confirms them.

**Route decision (patch vs redesign, PO direction 2026-10-03).**

- R1 builds a shared admission registry for every command the Pipeline emits.
- R5 replaces the design-course coordination core with a simplified
  coordinator instead of patching each refusal. The new coordinator removes
  authoring-dispatch registration through hand-built continuity CAS, resumes
  idempotently after interruption, and routes Advisor/readiness through the
  §21.4 role-route preflight.
- R1's registry must cover the commands of the new coordinator; R1 and R5
  therefore share one command catalogue.
- The PO may overrule this route at the final plan approval.

**Governing requirement (PO).** On the happy path, Claude (native Windows and
POSIX), Codex and Antigravity each complete onboarding, design, Advisor, plan
approval, implementation and push without guard overrides, operator hotfixes,
recovery ceremonies or repeated signatures. The happy path is defined as:

- one feature;
- one design revision cycle after Advisor/readiness findings;
- exactly one push, the final feature-branch push.

**Counting rule (what "two PO decisions" means).**

- Counted per feature on the happy path, the PO takes exactly two decisions:
  the final plan approval and the approval of that push.
- Every additional push costs exactly one more approval. In signature mode it
  is signed and commit-bound; in chat mode it is a chat confirmation bound to
  the exact commit. Additional pushes are outside the happy path and are never
  free.
- One-time acts are outside the per-feature count and are enumerated by name:
  repository enrollment consent (once per repository, at onboarding) and key
  setup, including first-use key confirmation (trust on first use, once per
  machine and key). Re-enrollment of a repository with retained Pipeline
  history is the same single enrollment act: the PO consents once, and the
  retire and activate steps run without further prompts (PO decision
  2026-10-04). Nothing else may ask the PO.
- The ceremony inventory (§21.3) classifies every PO interaction as
  `per-feature` or `one-time-onboarding`. Any other class fails the test.

**Agent-only design course (PO requirement 2026-10-04, design-input #16).**
During design — intake, stage-0 authoring, revision cycles after Advisor or
readiness findings, Advisor, readiness and presentation — the PO runs no
terminal command, places no file and signs nothing except the single final
approval. Course producer runs, course evidence writes, authoring and revision
registration in continuity, and resubmission are agent work through
catalogue-admitted commands (R1 owns admission incl. K5-8; R5 owns the
coordinator recording authoring and revisions itself, without a hand-built
continuity request or an override; R3 owns the absence of intermediate
signatures). The ceremony inventory (R3-1) counts any request for a PO terminal
command as a PO interaction.

**Consumer and platform universality (PO requirement 2026-10-04).** Every
R1–R6 change must work for every supported runner (Claude, Codex,
Antigravity) on every supported platform (native Windows, Linux, macOS, WSL),
and in consuming user repositories, not only in this source checkout:

- A consuming repository has the plugin installed outside its root and no
  Pipeline source tree; no fix may depend on source-only paths
  (`harness/…`, `specs/sprint-…`) or on files that exist only here
  (consumer-safe-paths check on every plugin change).
- Each workstream's acceptance fixtures run against a consumer-layout fixture
  repository (installed plugin outside the root, fresh `git init`, onboarding
  through the plugin) in addition to the source checkout, on the win32 and
  POSIX dialects.
- Runner-specific behaviour is selected by the runner identity, never by the
  host this repository was developed on; a runner or platform without a
  route gets a typed `unavailable` with a handoff, never a silent gap.
- AC-32's host matrix runs on greenfield user repositories, which is the
  end-to-end proof of this rule.

### 21.1 R1 — Lifecycle-command admission

IDs: K1-x, K1-1, K1-2, K1-3, K1-4, K1-5, K1-6, K1-7, K5-8, K7-1, K7-2, K7-3,
K9-2.

Contract:

- **Shared command catalogue.** Every command the Pipeline emits as
  `nextAction`, recovery action or documented course step, including R5's
  coordinator commands, comes from one shared catalogue of closed argv shapes.
  The guard admits exactly the catalogue entries valid in the current phase.
  Path spelling is normalised before matching: drive-letter case, backslash
  and forward slash, MSYS `/d/...`, repository-relative, and
  `${PIPELINE_PLUGIN_ROOT}` resolved against the verified plugin root. The
  catalogue covers `continuity-cas`, `continuity-integrate-final`,
  `cancel-submitted-plan`, `design-course-session` stages, the agent-side
  `guard-human-override.mjs` steps (`plan`, `prepare-authorization`,
  `prepare-for-signature`, `refreeze-plan`, `emit-signature-digest`,
  `authorize-by-signature`), `check-observation-governance.mjs`,
  `pipeline-start-preflight.mjs` and `project-onboarding-v3.mjs inspect` for
  every intent. R3 owns the ceremony preparation itself (K4-3); R1 only admits
  its commands through the catalogue.
- **Readiness intent.** `pipeline-start` documents every preflight status,
  including `hook-provisioning-required`. Bootstrap readiness and session
  readiness are evaluated with the same intent, or the preflight emits the
  session intent the guard checks (K7-3).
- **Scratch scripts stay fail-closed; scratch writes stay admitted.**
  - Executing a `scratch/` script, or any non-catalogue script, stays
    fail-closed in gated phases (PRD S2, Spec §5.2 item 3). There is no static
    scan, no denylist and no post-run diff as an admission mechanism.
  - Writing files under `scratch/` stays admitted in every phase (K1-5, write
    part).
  - The denial is truthful. It names the opaque-execution lane, does not claim
    that `scratch/` execution is admitted, and names the two sanctioned routes:
    the human runs the script (`!` prefix), or a Pipeline-owned catalogue
    command covers the need.
- **Course evidence outputs (K5-8).** The evidence output paths the course
  declares (under `evidence/design-course/<feature>/`, for example the Claude
  exception-rationale file) belong to the catalogue: the agent's Write to
  exactly those paths is admitted in the design phases that emit them,
  `awaiting-approval` included, and to no other `evidence/` path. Plan and Spec
  immutability is unchanged.
- **Git subcommand classification.** `git stash list` and
  `git stash show [<stash>]` are read-only. Denials name the real target
  operand, never a subcommand word (K1-7).
- **Scaffold commits.** Onboarding commits its own scaffold paths
  (`.gitignore`, `AGENTS.md`, `architecture/`, `pipeline.user.yaml`,
  `project/`) in the bootstrap transaction. Afterwards they are committable in
  every phase, within a stage-0 bound the onboarding exception defines (K9-2).
  Configuration read from `HEAD` never depends on a commit the current phase
  refuses.
- **Governed repairs.** A repair prescribed by a typed recovery is admitted
  without override. This includes classifier-generated
  `governance/observation-doc-governance.json` entries for new files under
  `docs/` and `docs/adr/` in every phase (K1-6, also needed by R6).

Acceptance cases:

- R1-1: The catalogue consistency test enumerates every emitted argv across
  phases and asserts guard admission on the win32 and POSIX dialects. It also
  asserts that every declared course evidence output accepts the agent's Write
  in the design phases that emit it and that other `evidence/` paths stay
  refused (K5-8).
- R1-2: Admission level: every command the design course emits up to
  `present-plan` is admitted, with zero overrides, in a Claude/Windows Git Bash
  fixture and a POSIX fixture. The end-to-end walk is covered only by AC-32 and
  §21.7.
- R1-3: The preflight is admitted under backslash, forward-slash, MSYS and
  placeholder spellings, and refused for a different script with the same
  basename.
- R1-4: A `scratch/` script execution in `awaiting-approval` is refused with
  the typed code. The denial text contains no claim that the path is admitted
  and names the human route. A Write to `scratch/` in the same phase is
  admitted.
- R1-5: `git stash list` is admitted in draft; `git stash pop` is refused; a
  refused write names its real target.
- R1-6: Onboarding commits its own scaffold. A later production-path commit in
  draft is refused.
- R1-7: An F6 repair (classifying a new `docs/adr/` draft) succeeds in draft
  with zero overrides.
- R1-8: `pipeline-start` documents every preflight status. A test fails when
  the preflight can emit a status the skill does not name.
- R1-9: The preflight and the guard evaluate the same readiness intent: a
  fixture whose preflight reports a ready bootstrap is never followed by a
  `partial` session readiness for the same state (K7-3).

### 21.2 R2 — Read policy

IDs: K2-1, K2-1b, K2-2, K2-3, K2-4, K2-5, K2-6, K2-6b.

Contract:

- **Auxiliary roots.** `isAllowedPassiveReadTarget` evaluates each auxiliary
  root independently. An unusable root is skipped and reported, and never
  fails an otherwise admitted target. Session roots are derived with
  `realpathSync.native`. On win32, path identity is compared case-insensitively.
- **WSL UNC paths and the credential-root list.** `\\wsl.localhost\<distro>\...`
  and `\\wsl$\...` are user-visible host paths for exact-file reads. One shared
  credential-root list applies to host paths and to distro paths alike
  (home-relative entries resolve against the host home and against every
  distro user home). Every entry stays denied in every spelling, both UNC
  spellings included:
  - `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.docker`
  - `~/.config/gh`, `~/.config/gcloud`
  - `~/.codex/auth.json`, `~/.claude/.credentials.json`
  - `~/.gemini/oauth_creds.json`
  - `~/.netrc`, `~/.git-credentials`, `~/.npmrc`, `~/.pypirc`
  - `/etc/shadow`
  - the configured PO key directory
- **Search tools.** Native Grep admits in-repo directories and `glob`/`type`
  filters. Native Glob admits wildcard patterns within the project root.
  Read-only `rg` flags (`-n`, `-c`, `-o`, `-l`, `-A/-B/-C`, `--glob`, `-e`) are
  admitted. Search patterns and `-e` operands are never evaluated as read paths
  (K2-6b).
- **Git pipelines.** `git <read-only> ... | head -n N` treats revision
  arguments (`<rev>:<path>`, `HEAD~N`) as revisions. Every grammar example in
  refusal text is covered by an admission test.
- **Transcripts.** The current session's own transcript directory is
  admissible for read-only forensics through the project-bound reader (K2-6;
  reproduce first).
- **Refusal texts.** Every refusal names the guard code and the real cause. No
  in-root target yields `GUARD-READ-SCOPE-OUTSIDE-ROOT`. No role-name parse
  failure is reported as an Advisor-prohibition problem (`APB-DISPATCH-INVALID`).

Acceptance cases:

- R2-1: In a Windows fixture with case-mismatched session roots, in-root Read,
  Grep, Glob and `head` are admitted.
- R2-2: An exact-file Read over UNC is admitted. For every entry of the shared
  credential-root list, a read through the `\\wsl.localhost\<distro>\` spelling
  and through the `\\wsl$\<distro>\` spelling is refused.
- R2-3: Grep on a directory, Grep with `glob`, Glob `**/*.md`,
  `rg -A2 --glob`, `rg -c` and `rg -e pat` with a `/` in the pattern are all
  admitted in root. The same shapes targeting `~/.ssh` are refused. The
  session's own transcript directory is listable once K2-6 is reproduced.
- R2-4: `git show HEAD:docs/state.md | head -n 5` is admitted. Every printed
  grammar example passes.
- R2-5: Refusal-text audit: no in-root target gets an outside-root code, and
  `APB-DISPATCH-INVALID` is never emitted for a role-name parse failure.

### 21.3 R3 — Authorization ceremonies and push

IDs: K4-1, K4-2, K4-3, K4-4, K4-5, K4-6, K4-6b, K4-9, K6-1, K6-2, K6-3.

Contract:

- **Decisions.** The happy path issues exactly the PO decisions counted in
  §21.0. The final plan approval is one signed (or chat) act covering the
  design-workflow package and the plan approval. The bootstrap plan
  acknowledgement and the onboarding confirmations are folded into onboarding's
  single enrollment consent or removed. The ceremony inventory test enumerates
  every PO interaction per runner and mode and classifies each as `per-feature`
  or `one-time-onboarding` (§21.0). There is no further class and no list of
  residual ceremonies that is allowed to pass.
- **Push signing.**
  - In signature mode every push requires a signed approval bound to the exact
    commit, remote and destination; `feature-checkpoint` pushes included. Every
    additional push costs one more approval (§21.0).
  - A checkpoint push keeps its slim prerequisite set (no Verify, security or
    Critic chain). Release and main promotion keep the full chain.
  - The pre-push hook enforces the same rule, including Ed25519 proof
    verification.
  - Onboarding installs the pre-push hook, so a fresh clone has it before the
    first push (K6-2).
- **Override match key.**
  - An armed override is matched on: tool name; a canonical digest over the
    semantically effective input only (Bash `command`; Edit
    `file_path`/`old_string`/`new_string`/`replace_all`; Write
    `file_path`/`content`; never `description` or other runner-cosmetic
    fields); the denying guard set; and the policy identity.
  - The **governed target** is the set of repository paths the command can
    write according to the guard's own classification. For an opaque Bash
    command it is the whole tracked tree.
  - **Pipeline-owned writes** are `project/pipeline-state.json`, `evidence/`,
    `scratch/` and `.git/agent-pipeline/`.
  - Drift on a tracked file outside the governed target and outside
    Pipeline-owned paths still refuses the capability. Every refusal names the
    drifted inputs. Changes to untracked files outside the governed target do
    not drift the capability. This narrows, never widens, what a capability
    admits.
- **Ceremony mechanics.** Signing intents work on unborn HEAD. All agent-side
  preparation runs in session (K4-3); R1's catalogue admits the commands, but
  the preparation is owned here. The PO receives one command per decision,
  rendered without backslash line continuation and within 100 columns per
  physical line (the digest may be split into variable-assignment chunks as
  today). The PO never copies JSON back.
  - The signing window starts when the signing command is handed to the PO
    (prepare-for-signature), not at the denial. Default 60 minutes,
    configurable 5–120; the absolute expiry is part of the signed text (PO
    decision 2026-10-04).
  - Chat mode: a push or plan confirmation is given in the session itself,
    bound to the exact commit/target text and labelled as chat attribution
    (ADR-0056); no separate terminal code (PO decision 2026-10-04).
  - Projects whose push gate is `standing-approved` keep admitting checkpoint
    pushes without a per-push approval (PO decision 2026-10-04); the
    every-push rule applies to signature and chat modes.
- **Configuration overrides.** A PO-signed configuration override is a durable
  override layer that migrations preserve (K4-5).

Acceptance cases:

- R3-1: The ceremony inventory runs per runner and mode (signature, chat) for
  four scenarios:
  - A: enrolled repository, existing key, one push → per-feature count 2,
    one-time acts 0.
  - B: fresh repository, fresh key, one push → per-feature count 2, one-time
    acts exactly {enrollment consent, key setup / first-use key confirmation}.
  - C: two pushes → per-feature count 3.
  - D: re-enrollment of a repository with retained Pipeline history, existing
    key, one push → per-feature count 2, one-time acts exactly one
    (enrollment consent); the retire and activate steps run without any
    further prompt (PO decision 2026-10-04 #7).

  An interaction in any other class fails the test.
- R3-2: Run from a fresh clone after onboarding:
  - an unsigned signature-mode checkpoint push is refused by the session guard
    and by the pre-push hook;
  - an exact-commit signed approval is admitted;
  - a chat-mode checkpoint push without chat confirmation is refused.
- R3-3: Arm the capability, then:
  - create an unrelated untracked file → the identical retry consumes it;
  - repeat with a different Bash `description` → it consumes;
  - change a tracked file outside the target → refused, naming the drift;
  - change the governed target → refused.
- R3-4: An unborn-HEAD signing intent builds and verifies.
- R3-5: Rendered PO commands contain no continuation and keep each physical
  line within 100 columns.
- R3-6: A signed routing override survives
  `runner-profile-migration-v3 apply --activate`.
- R3-7: A release/main promotion still requires the full chain while a
  checkpoint push does not.
- R3-8: The signing window starts when the signing command is handed over
  (prepare-for-signature), not at the denial. The default is 60 minutes and the
  configurable range is 5–120 minutes (a value outside the range is refused).
  The absolute expiry is inside the signed text, and a signature over an
  altered expiry does not verify (PO decision 2026-10-04 #5).
- R3-9: In chat mode a push or plan confirmation given in the session itself is
  accepted only when it is bound to the exact commit and target text, and the
  record labels it as chat attribution; no separate terminal code is needed. A
  confirmation bound to another commit or target, or an unbound one, is
  refused (PO decision 2026-10-04 #10; ADR-0056).
- R3-10: In a `standing-approved` project a checkpoint push is admitted
  without a per-push approval exactly as before, while the same push in
  signature mode needs a signed commit-bound approval and in chat mode a
  commit-bound chat confirmation (PO decision 2026-10-04 #11).

### 21.4 R4 — Runner parity, platform parity and role routes

IDs: K3-1, K3-2, K3-3, K3-4, K3-5, K3-6, K3-7, K3-8, K3-9, K3-10, K3-11, K3-12,
K3-13, K3-14, K3-15, K3-16, K3-17, K5-12, K7-4, K7-5.

Contract:

- **Role-route preflight.** A typed, read-only preflight reports, per runner
  and role (Advisor, Critic, Goldfish tiers, readiness, plan-verifier),
  `native`, `fallback-self-dispatch` (Advisor only) or `unavailable`, each with
  a reason code.
  - A fallback self-dispatch may substitute ONLY the Advisor duty, and only as
    a labelled, non-authorizing advisory input
    (`assurance: fallback-self-dispatch`). It never satisfies independent
    readiness (§17), the Critic gate or plan-verifier.
  - Readiness, Critic and plan-verifier evidence must come from a
    host-observed child: fresh process, read-only effects, terminal state,
    result bound to the dispatch (§17). Where a runner has no such route, the
    preflight reports `unavailable` with a reason code, and presentation and
    close are refused. They are never silently downgraded.
  - A runner-native subagent (for example a Claude `Agent` dispatch) counts as a
    host-observed child only when the runner's hook layer itself records its
    dispatch start, enforces read-only effects on every tool call (write tools
    and write-capable shell lanes refused for the role), and records its
    terminal result bound to the dispatch id; a model-authored claim of any of
    these facts does not count. The preflight names the mechanism used
    (`cli-child` or `hook-observed-subagent`), and a role whose runner offers
    neither is `unavailable`.
  - **Mechanism per role (PO decision 2026-10-04 #14).** On Claude and
    Antigravity the Critic and the plan-verifier run as `hook-observed-subagent`
    native subagents; independent readiness stays a `cli-child` (§17). This is a
    measured precondition, not an assumption: PRD §1.2 and §8 A-2 record that
    plugin hooks did not fire inside dispatched subagents on the measured
    Claude build. R4 therefore makes each runner's hook layer (a) observe
    subagent start, (b) enforce read-only effects on every subagent tool call
    and (c) record the terminal result bound to the dispatch id, and measures
    per runner that these hooks fire inside subagents (the A1 conformance
    probe, §4.1, is the measurement vehicle). Until that measurement is
    recorded for a runner and role, the preflight reports the role
    `unavailable`; presentation and close are refused, with no silent
    downgrade to a self-reported or fallback result (R4-12).
  - A fallback Advisor dispatch is recorded in a dispatch→result record that
    binds the template digest, the exact sent prompt digest, the native
    subagent id and the result digest (closes K3-6). The fallback Advisor runs
    read-only, and the guard refuses its write tools. A result whose subagent
    id or prompt binding equals the implementor's dispatch is refused as
    self-review.
  - **Advisor exception.** Where a runner's Advisor course ends
    typed-unavailable, any exception rationale presented to the PO states only
    receipt-backed facts: the course outcome and code, and the absence of a
    native Advisor child for that runner. It never cites a fallback consult or
    an earlier chat decision as evidence, and it is non-authorizing. In this
    version the design course has no wired Claude Advisor route: the native
    no-child route records unavailability, and the governed consult fallback
    of §17 is not wired into the course (the course accepts an `answered`
    Advisor result only for Codex; K3-2). R4's role-route preflight delivers
    that route. Until then the exception may cite only this receipt-backed
    fact, the course outcome and code, and the no-child facts; it does not
    claim that no Advisor route can exist.
- **Model-family approval (PO decision 2026-10-04 #2).** The PO approves a
  model family per role, not a single model release.
  - Newer versions of an approved family are used automatically.
  - Activation is all-or-nothing across runners; there is no per-runner
    activation scope. Activation is refused unless every available route is
    assigned.
  - When the newest release of an approved family is not selectable on a
    runner, the older selectable release is used and the selection records
    that it is a fallback. A watermark records the newest release selected for
    the family, and a later selection of an older release is refused as a
    downgrade.
  - A family switch, a slot change, a pin or unpin and a floor change each need
    a signed authority decision (detached human proof); an agent never applies
    one, and a chat statement does not.
  - The existing dormant model-selection subsystem is qualified, wired and
    activated; no new resolver is introduced.
  - Activation works on native Windows: neither a POSIX mode-bit check nor a
    path check that drops the drive letter applies on its path.
  - A Compact or an offline re-entry reuses the held selection instead of
    re-resolving it, so the session keeps the same model id (R4-11).
- **Producers.** Producer failures surface bounded, sanitized stderr text and
  the exit code. Advisor export creates its own output directory, uses
  platform path segmentation, and resumes idempotently: re-running after an
  interruption re-exports byte-identical artifacts from the stored terminal
  course, and a second re-run is a no-op (K3-1, K3-14, K3-15).
- **Readiness child (K5-12).**
  - Failure classes (non-zero exit, timeout, stderr output, parse failure,
    binding mismatch) carry distinct typed sub-reasons with a bounded,
    sanitized stderr head, and the course reports the real stderr byte count,
    instead of one `DESIGN-READINESS-RUNNER-UNAVAILABLE`.
  - The schema handed to the runner CLI is a copy without the `$schema` and
    `$id` metadata keys. Constraints are unchanged, and the returned output is
    still validated against the full schema. The Antigravity validator is
    unknown, so R4 checks it.
- **Platform parity (Windows and macOS).**
  - The dispatch-budget counter lock has a cross-platform owner identity with
    live, dead and ambiguous semantics (K3-9).
  - POSIX mode-bit and uid checks are applied only where the platform has
    them. Every private store keeps its symlink, nlink, realpath, identity and
    exclusive-create checks. Windows privacy relies on profile and `.git` ACLs,
    which are documented (K3-10).
  - Directory fsync is skipped where the platform refuses it (K3-13).
  - `/proc` readers have platform equivalents or typed unavailability.
  - A sweep test fails on any new unguarded `0o077`, `getuid` or `/proc` use.
  - The repository's Advisor host fixture builds its temporary repository on
    native Windows, so the Advisor export and re-run tests run there (K3-16).
  - **Trusted runner-CLI location (win32, K3-17).** On win32
    `resolveTrustedSystemExecutable` also trusts `<homedir>\.local\bin` for
    `.exe` executables, symmetric to POSIX `~/.local/bin`. The directory is
    derived from the home directory at run time (no host path in code), and all
    physical, symlink and realpath checks stay.
- **Dispatch budget.**
  - Every budget-counted role, Advisor and plan-verifier included, gets a
    positive working cap. Small roles do not reserve the safety margin
    (K3-12).
  - The pre-launch dispatch check validates the budget line for every
    budget-counted role and refuses a missing or malformed line before launch
    (K3-11).
  - The budget line format is documented once and accepted with or without a
    list marker.
- **Agent types.** The dispatch guard accepts the built-in agent types
  `Explore`, `Plan` and `general-purpose`. They stay template-bound (a goldfish
  or critic template), are budget-counted with a valid budget line, and are
  write-scoped by the same guards. They never carry Advisor, Critic or
  readiness authority. Advisor-prohibition parsing runs only when the
  prohibition line is present (K3-8).
- **Antigravity.** Every duty profile `feature` requires is available or
  fallback-routed (Advisor only; other duties follow the preflight rules
  above). Native subagents get a bootstrap step they can satisfy. Lock
  freshness is bound to the session when a session id is available. Without a
  session id the 30-minute window remains as a compatibility fallback,
  reported as `unbound-window` and never as session-bound (PO decision
  2026-10-04; K3-3, K3-4, K7-4). Readiness, Critic and Advisor routes are
  enabled for Antigravity in 0.7.0 without a prior host measurement (PO
  decision 2026-10-04); every failure of these routes is typed and surfaced,
  and the PO host run (AC-32) is the evidence.
- **Codex.** Host-commit requirements are stated in the briefing template and
  checked before dispatch; an ineligible dispatch gets a typed pre-dispatch
  finding (K3-5). A Codex Goldfish dispatch without the host-commit binding is
  refused before launch unless its briefing states
  `Host commit: not-requested (reason: …)` (PO decision 2026-10-04).
- **SessionStart hints** are runner-specific (K7-5).
- **Hotfix removal.** Operator hotfixes 1–7 of the installed copy are
  superseded by these source fixes (they address findings in K3-9…K3-15,
  K3-17, K5-10 and K5-12). The stamped candidate must contain the source fixes
  and run its R4 and R5 fixtures without any hotfix applied.

Acceptance cases:

- R4-1: Route-preflight fixtures per runner cover `native`,
  `fallback-self-dispatch` (Advisor only) and `unavailable`. Presentation and
  close are refused when a readiness, Critic or plan-verifier route is
  `unavailable`. An exception rationale generated for an unavailable Advisor
  route contains only receipt-backed facts.
- R4-2: A fallback Advisor result is accepted with the label. A fallback result
  offered as readiness, Critic or plan-verifier evidence is refused by the
  package/close validator. A fallback Advisor's Write is refused. A result
  whose binding equals the implementor dispatch is refused. A Claude Critic
  subagent result is accepted as Critic evidence only with the hook-recorded
  start, per-call read-only enforcement and terminal binding; a result missing
  any of them, or a role call that reached a write tool, is refused.
- R4-3: Antigravity: the `feature` profile reaches readiness and Critic through
  host-observed children; a subagent completes Read and Write after its
  bootstrap step; a resumed session after more than 30 minutes is observed as
  hard-enforced.
- R4-4: A native-Windows budget-counted Goldfish completes Read, Write and Bash.
  `consult-advisor` (maxTurns 10) and `plan-verifier` (maxTurns 15) complete
  their capped calls. An `Explore` dispatch is admitted. A consult dispatch with
  a malformed budget line is refused before launch. Negative cases: a built-in
  type dispatch with a missing budget line is refused; a built-in type result
  offered as Critic evidence is refused; the Advisor-prohibition line is still
  parsed when present.
- R4-5: A Codex unmarked dispatch yields a typed pre-dispatch finding.
- R4-6: Claude SessionStart output names no other runner.
- R4-7: An Advisor producer failure returns stderr text in the session result.
  An interrupted export re-run yields byte-identical artifacts; the second
  re-run is a no-op. A readiness-child failure returns a typed sub-reason and a
  bounded stderr head, and each failure class (exit code, timeout, parse
  failure, binding mismatch) maps to its own sub-reason (K5-12).
- R4-8: The Windows sweep test fails on an unguarded mode-bit, uid,
  directory-fsync or `/proc` check. The Advisor host fixture builds its
  temporary repository on native Windows (K3-16). The candidate's design course
  runs on native Windows with no hotfix.
- R4-9: On native Windows the readiness bootstrap resolves a Claude CLI
  installed under `<homedir>\.local\bin` as a trusted `.exe`. A symlinked,
  realpath-escaping or non-`.exe` candidate there is refused (K3-17).
- R4-10: The schema passed to the Claude CLI carries neither `$schema` nor
  `$id`, the CLI accepts it, and a receipt that violates a constraint of the
  full schema is still rejected (K5-12).
- R4-11: Model-family fixtures, one set per runner (Claude, Codex,
  Antigravity):
  - the newest selectable release of an approved family is used;
  - a hidden newest release makes the older selectable release the selection,
    and the selection records the fallback;
  - a later selection of an older model id is refused as a downgrade
    (watermark);
  - activation is refused unless every available route is assigned, and there
    is no per-runner activation scope;
  - a family switch, slot change, pin or unpin and floor change without a
    signed authority decision is refused;
  - the activation path passes on native Windows (no POSIX mode-bit check, no
    drive-letter-dropping path check);
  - after a Compact or an offline re-entry the held selection keeps the same
    model id and nothing is re-resolved.
- R4-12: Per runner (Claude, Antigravity) for the Critic and plan-verifier, a
  fixture and a live A1-style measurement show the hook-recorded subagent start
  and terminal records bound to the dispatch id, and a write tool refused
  inside the subagent. A runner and role without that measurement reports
  `unavailable` and refuses presentation and close.

### 21.5 R5 — Design-course contract and coordinator redesign

IDs: K1-8, K4-7, K5-1, K5-2, K5-3, K5-4, K5-5, K5-6, K5-7, K5-9, K5-10, K5-11,
K8-3, K9-1, K9-3, K9-4.

Contract:

- **Simplified coordinator (§21.0 route).** One machine-emitted sequence:
  intake → stage-0 authoring (the Elephant under the EL-16 design-phase
  exemption, or a dispatch) → binding → Advisor → `submit-plan` → readiness →
  presentation.
  - Authoring is recorded by the coordinator itself; no hand-built continuity
    request.
  - A design revision after Advisor or readiness findings is one emitted step
    that rebinds the sources and keeps the existing submission lineage, with
    no `reopen-design` loop and no PO confirmation (K1-8, K4-7). It works on
    every runner, Claude and Antigravity included, after the Advisor stage: the
    package and readiness binding follow the revised sources instead of the
    Advisor course's initial candidate, the Advisor stage stays one cycle
    (§17), and no Codex-only `--revisions` option is needed (K5-7).
  - Each stage resumes idempotently after interruption.
- **Course-run mechanics (K5-9, K5-10, K5-11).** `--run-v2` runs both with and
  without `--advisor-result`; its declared output prefix does not collide with
  the paths the coordinator itself writes and the guard admits. The readiness
  child receives the runner argument on every runner. A readiness failure after
  preparation leaves a resumable state: the next `--run-v2` resumes or replaces
  the stale preparation idempotently instead of refusing
  `DESIGN-COURSE-PREPARATION-EXISTS`.
- **Generated role rules.** Generated short forms of role rules keep their
  qualifiers (EL-16 design-phase exemption).
- **Trailer grammar.** One trailer grammar generates the obligations, guard
  admission and authorship verification. Direct Elephant design commits use
  `Dispatch: stage-0 (elephant)` only; the `design (elephant)` form is removed
  from every printed example and generator (PO decision 2026-10-04).
- **Intake inputs.** `--answers-file` (with digest) is available wherever
  `--answers-json` is. Intake reuses the onboarding-confirmed language.
- **Verify contract.** The design course fixes an executable Verify contract
  before presentation; the design→implementation `collect-input` stays as a
  backstop.
- **Briefing quality.**
  - Dispatch briefings carry verified exact paths (preflight path check, K9-1).
  - The generated obligations state the closed shell grammar (K9-4).
  - The private-identifier pre-commit check covers consumer specs (K9-3).
- **Proportionality (K5-1).** A small local project gets a bounded course with
  compact artifacts and the same single final decision.

Acceptance cases:

- R5-1: The doc/emitter consistency test fails if the documented sequence and
  the coordinator's emitted steps diverge. A small-local-project fixture runs a
  bounded course with compact artifacts and the same single final decision
  (K5-1).
- R5-2: Every printed commit example passes the installed commit guard and
  commit-msg hook.
- R5-3: A 30 KB answers file is accepted on Windows, and the language is
  asked once.
- R5-4: Presentation is refused without a configured Verify contract.
- R5-5: A generated short form contains the EL-16 qualifiers.
- R5-6: One design revision after an Advisor finding needs zero PO
  interactions and zero overrides, does not loop, and works on Claude and
  Antigravity after the Advisor stage as well as on Codex (K5-7). The same
  holds for a revision after a not-ready readiness: the full cycle up to the
  next presentation completes with zero PO terminal commands, zero file
  placements by the PO, zero overrides and zero intermediate signatures
  (design-input #16).
- R5-7: A private first name in a consumer PRD is refused at pre-commit
  (K9-3). A briefing that cites a role path that does not exist is refused by
  the path preflight before launch (K9-1). The generated obligations contain
  the closed shell grammar (K9-4).
- R5-8: Course-run fixtures:
  - `--run-v2` without `--advisor-result` completes in a fixture whose output
    paths start with the declared prefix (K5-9);
  - the readiness argv contains `--runner` for Claude and Antigravity (K5-10);
  - after a readiness failure that follows preparation, the next `--run-v2`
    resumes without any manual file move (K5-11).

### 21.6 R6 — Forensics and audit chain

IDs: K7-6, K8-1, K8-2, K8-4, K8-5, K9-5.

Contract:

- **Transcript reader.** The project-bound transcript reader supports Claude,
  Codex and Antigravity. It merges multi-file segments and child sessions, and
  reports usage only where the host supplies it (K9-5).
- **Digest drift.** `inspect` compares the continuity PRD/Spec digests with the
  checkout and surfaces drift as an open recovery.
- **Unclassified docs.**
  - A new `docs/*.md` or `docs/adr/*` file cannot be committed unclassified.
  - The writer classifies its own documents through the R1 governed repair, so
    a design-phase doc commit needs zero overrides.
  - The observation-governance check runs in the pre-commit hook.
- **Host paths.** Host-specific absolute paths are refused by a pre-commit
  check. The existing occurrences are sanitized forward without a history
  rewrite (K8-5).
- **Audit index.** A generated per-change audit index lists source, commit and
  gate digests and names missing steps explicitly.

Acceptance cases:

- R6-1: A multi-segment session fixture is readable per runner. An Antigravity
  transcript without usage fields yields no usage figures rather than an
  estimate presented as measured (K9-5).
- R6-2: A continuity digest drift fixture is reported by `inspect`.
- R6-3: An unclassified `docs/*.md` commit is refused. A writer-classified ADR
  draft commit in draft needs zero overrides.
- R6-4: An audit index is generated for a fixture change with one deliberately
  missing gate.
- R6-5: A tracked file containing a host user path is refused at pre-commit,
  and the two known Alfred occurrences are sanitized.

### 21.7 Sequencing, integration ownership and completion

**Wave 0 (before step 1).** The E1 contract freeze (§3, §13: the first
authorized foundation act) and the verbatim port of operator hotfixes 1–7 into
the source tree. R4 and R5 then own the fixtures and acceptance that replace
every dependence on an applied hotfix (R4-8, R5-8).

1. **R1 + R2 next.** R5's coordinator command catalogue is designed together
   with R1's registry. The A1/C1 measurement work (§4.1, §6.1) interleaves
   after R1, because it needs R1's admission catalogue; every other step
   keeps the order below.
2. **R4 platform and budget fixes next** (K3-9…K3-17 and K5-12, replacing the
   hotfixes), then the role-route preflight.
3. **R3, R5 and R6 in parallel slices.** One named **hook-and-commit-policy
   integration slice** owns:
   - the commit-msg, pre-commit and pre-push installers;
   - the commit-message policy;
   - the trailer grammar.

   R3, R5 and R6 contribute through it. Hook provisioning (K6-2) lands before
   the R3-2 tests.
4. **Recovery (§20)** is sequenced after R4, because its owner observation
   needs the platform sweep.

Hotfix dependency: development on this Windows host relies on operator
hotfixes 1–7 until the source fixes land. The candidate must not depend on
them (R4-8, R5-8).

**End-to-end scenario (AC-32).** Per host, on the stamped local candidate, one
feature with one design revision cycle and one push:

1. Onboarding: repository enrollment consent and key setup (one-time acts,
   §21.0).
2. Design: intake, stage-0 authoring, binding (§21.5 coordinator).
3. Advisor stage (native route, or the labelled fallback where §21.4 permits
   it).
4. One design revision cycle: the single rebinding step the Advisor or
   readiness findings require (R5-6). The run record names the trigger.
5. Independent readiness (host-observed child, §17).
6. Final plan approval: PO decision 1.
7. Implementation: Goldfish dispatches and Verify.
8. One feature-branch push with its approval: PO decision 2, then read-back.

**Host matrix.** Claude on native Windows (Git Bash); Claude on Linux or WSL;
Codex on Linux or WSL; Antigravity on its supported host.

**Pass rule (per host).** Zero guard overrides, zero operator hotfixes, zero
recovery ceremonies; per-feature PO decisions exactly two, with one-time acts
limited to those enumerated in §21.0; the push completed and read back. A host
without a run record is `not verified`, never passed. Each host has its own
evidence; source fixtures do not substitute for native runner observations.
Independent Critic review, Verify, security and PO acceptance remain separate
gates. The round is complete only when AC-32 passes on the host matrix.

### 21.8 Deferred rows (reproduction first)

Each row below is owned here and by no workstream. A row naming a sub-aspect of
an owned ID is a reproduction step for that sub-aspect, not a second owner.

| ID | Reproduction step |
|---|---|
| K4-8 | Read the HGO plugin identity on a Claude install and a Codex install. A `+codex` label on a Claude install confirms the drift. |
| K7-7 | Compare the `docs/state.md` projection with `pipeline-state inspect` after a design revision. |
| K7-8 | Run the PO profile receipt check on a freshly cloned repository and capture its failure code. |
| K4-1 footer suspicion (sub-aspect of K4-1, owned by R3) | Produce a denial whose reason carries the "remains available" footer, then compare request digests. |

## 22. 2026-10-06 device switch: agent-recoverable operation and device portability (R7)

Source of findings: PO decisions 17–19 of 2026-10-06 and 20–27 of 2026-10-07
(`design-input.md`) and the toil rows T1–T20 recorded while the approved
candidate was brought up on a second device (T1–T17 on 2026-10-06, T18–T20 on
2026-10-07). The toil log was a working note in the ignored `scratch/`
directory, so this section carries each row's finding and cost itself. Three
tracked backlog items hold the sharpest defects:
`backlog/items/2026-10-06-git-for-windows-2-56-rejects-git-config-global-nul.md`,
`backlog/items/2026-10-06-preflight-hides-the-git-error-behind-gs-git-unavailable.md`
and
`backlog/items/2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory.md`.
This section is additive. It does not relax §§1–21 and grants no
implementation authority. It is complete in itself: §22.0 lists every row
T1–T20 exactly once, owned by one R7 contract or mapped to the existing owner
whose approved scope already covers it, and `traceability.md` repeats the same
ownership as a map whose row count equals 20. It records no Advisor answer, no
readiness, no approval and no host evidence.

### 22.0 Scope rule, governing requirement and row ownership

**Governing requirement (PO decision 2026-10-06 #17).** The Pipeline is built
so that an agent flows through bootstrap, install, recovery, device switch and
lifecycle repair without hurdles. Every block comes with an agent-executable
fix, and the human is needed only where a real signature is required. This
makes decisions 15 and 16 of 2026-10-04 concrete; it is not new authority.

**Scope rule (decisions #18 and #26).** All 20 rows are fixed in the next
candidate (0.7.0), none deferred: T1–T17 by decision #18; T18–T20 were recorded
on 2026-10-07 and join the same register under the same rule (decision #26
decides T19, and T20 is closed by the SubagentStart receipt of the PO decision
"bootstrap receipt option B", R7-11). Each row is owned by exactly one R7
contract (§22.1–§22.8, §22.10 and §22.11) or mapped to the existing owner named
below. A mapped row gets no second contract here; §22.9 only adds a replay
obligation on the owner's fixture.

**Prerequisites (decision #19).** Environment prerequisites are checked at
install and bootstrap, reported with a concrete repair action, and never
discovered for the first time at a signature (R7-7).

**Typed repair rule.** Every non-ok R7 outcome carries exactly one of:

- an agent-executable action: a `nextAction` envelope with the fields the
  preflight emits today (`kind`, `executable`, `argv`, `mutation`,
  `requiresConfirmation`, `expected.schema`), whose argv is a catalogue entry
  (§21.1) admitted in every phase that emits it, with `requiresConfirmation`
  `false`; or
- a typed attended-prerequisite result naming the concrete prerequisite
  (§20.1, RV-11), where safe repair is impossible (decision 15).

An outcome with neither fails its case. Read-only diagnosis is non-authoritative
and never changes admission.

**Signature rule.** R7 asks the PO for a signature only in these five existing
signature classes. Each is defined outside §22, and R7 adds none:

1. Trust-anchor change or first-use key confirmation: the one-time key setup of
   §21.0 (counting rule, one-time acts).
2. Final plan approval, including a re-approval where an approval's digest set
   really changes (§21.0 counting rule; R7-5 `digest-set-changed`).
3. Push approval (§21.0 counting rule; §21.3 push signing).
4. The signed quality package for protected paths: the existing route by which
   a change to a protected-baseline surface (the A3 baseline,
   `pipeline.protected-baseline.v1`) is built by the agent, independently
   reviewed and signed once by the PO. R7-1 relies on it only where it says
   that protected sites change through it.
5. The §20.2 signed legacy-custody transaction, with the attended external
   route of §20.1 (RV-8…RV-11). R7-2 and R7-10 rely on it only as the attended
   route for the descriptors and registrations they must not archive or
   supersede (R7-2: a descriptor that holds authority; R7-10: the refusals that
   name it).

No R7 mechanic (diagnosis, archival, provisioning, rebind of an unchanged
approval, key-directory or toolchain setup, the signing-readiness check, state
commits, superseding a stale authoring registration, bounded waiting on the
dispatch-budget lock) needs a signature of any class. R7 adds no interaction to
scenarios A–D of R3-1. The one attended confirmation that remains in R7 is not
a signature: the shipped orphan-archive route of R7-2 (PO decision 2026-10-07
#24) is one confirmation with `--by` attribution, a recovery act outside the
happy-path count of §21.0, and not a signature class. R7-9b checks every R7
case and doc against exactly this enumeration.

**Consumer and platform universality (§21.0 applies unchanged).** Every R7
case runs against the source checkout and against a consumer-layout fixture
repository (plugin installed outside the root, fresh `git init`, onboarding
through the plugin), on the win32 and POSIX dialects, and selects runner
behaviour by runner identity only. No fix names a source-only path or a
machine-specific path; the Git install root, the PO's key directory and the
user home are derived at run time and redacted in every report. Any new schema
id an implementation adds is registered in the §9 registry in the same change;
the closed field and enum lists below are normative.

**Row ownership (15 rows owned by R7, 5 mapped; the Owner column names exactly
one owner per row).**

| Row | Finding and cost | Owner |
|---|---|---|
| T1 | Git for Windows 2.56.0.windows.1 rejected the `NUL` spelling every hardened git spawn used; the preflight reported `GS-GIT-UNAVAILABLE` with the cause swallowed (about 40 tool calls, PO-run probes) | R7-1 |
| T2 | Pre-ready lockdown refused every diagnostic (`git config`, `git worktree list`, `stat`, directory Grep/Glob, `node -e`), so the session could not diagnose itself | R7-1 |
| T3 | Two orphan session descriptors of a blocked session needed a PO decision and a `--by` actor | R7-2 |
| T4 | The pre-push hook was absent on the second device (an unbacked gate) and needed PO confirmation | R3 (K6-2, R3-2) |
| T5 | The approval-bound design package lived in the ignored root `evidence/`, so the approval was unverifiable on another device | R7-3 |
| T6 | Backlog writes were refused while the package was unverifiable; items were parked in `scratch/` | R7-4 |
| T7 | The only offered recovery was `reopen-design`, a full course again | R7-5 |
| T8 | `submit-plan` needs idle continuity; clearing the registered authoring dispatch needed `continuity-cas` and a signed override | R7-10 |
| T9 | Re-registering an authoring dispatch for the course needed a signed override again | R5 (R5-6) |
| T10 | Agents could not write the course's own outputs under `evidence/` in the design phase | R1 (K5-8, R1-1) |
| T11 | Committing `project/pipeline-state.json` in the design phase was refused (`GUARD-DEVPLAN-LIFECYCLE`); the state change stayed uncommitted across a ceremony | R7-4 |
| T12 | The handover did not list device-bound (ignored) artifacts | R7-3 |
| T13 | No wired Claude Advisor route, so a one-time exception rationale was needed every course | R4 (K3-2, R4-1, R4-2) |
| T14 | `sign-intent` without a remembered key directory: the per-repository value lives in non-travelling private state | R7-6 |
| T15 | `sign-intent` spawned bare `openssl` from PATH; the one Git for Windows ships was not on the signing terminal's PATH (second failed attempt, PO PATH surgery) | R7-6 |
| T16 | Bootstrap does not check preconditions that later block (known-bad Git, signing toolchain, key directory against trust anchor, hooks, tracked bound files) | R7-7 |
| T17 | `continuity-cas` from the PowerShell lane returned `GUARD-POWERSHELL-GRAMMAR` with no override route; only the Bash lane offered the ceremony | R7-8 |
| T18 | Pipeline-prescribed preparation scripts (`dispatch-record-strip-for-critic.mjs`, `goldfish-commit-command-flow.mjs`) were refused in `draft` as opaque script execution with only a signed-override route, so a Critic was dispatched without its stripped record and a Goldfish fell back to hand-composed git commands | R1 (§21.1 catalogue, R1-1) |
| T19 | Parallel tool calls of one subagent race that agent's dispatch-budget counter lock: the second call is refused `DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy)`, reads included (one dispatch stopped at call 4; dispatches had to be serialized) | R7-11 |
| T20 | A subagent's bootstrap receipt was recorded only by a preflight whose spelling the draft-phase guard admits; any other spelling was refused as opaque script execution and the receipt gate then blocked the subagent's first Write (one dispatch stopped; briefings had to carry the exact spelling) | R7-11 |

Rows: 20. Owned by R7: 15 (T1, T2, T3, T5, T6, T7, T8, T11, T12, T14, T15,
T16, T17, T19, T20: R7-1 two, R7-2 one, R7-3 two, R7-4 two, R7-5 one, R7-6 two,
R7-7 one, R7-8 one, R7-10 one, R7-11 two). Mapped to existing owners: 5 (T4, T9,
T10, T13, T18). R7-9 owns no row. Total 20. T-rows are not findings-register
IDs, and the 77-ID map of §21 is unchanged.

Secondary references are not owners: T4 is also exercised by the R7-7 report
(case R7-7e) and by the replay in R7-9; T9 is also exercised by the R1
catalogue admission of the verb (§21.1); T18 is also exercised by the named
replay step and case R7-9c; T7's lost-artifact sub-case is decided (PO decision
2026-10-07 #25: fail closed, nothing reused, §22.5); T8 has an R5-6 neighbour
(the coordinator records authoring itself, §21.5), which does not state the
clearing obligation that R7-10 states.

### 22.1 R7-1 — Git child environment and diagnosable failure

Rows owned: T1, T2.

Contract:

- **One null-device constant.** Every git child process the Pipeline spawns
  takes its null device (`GIT_CONFIG_GLOBAL` and every other config or hook
  null value) from one shared constant whose value is `/dev/null` on every
  platform. Git for Windows maps it itself in both its MSVCRT and UCRT builds.
  The spellings `NUL` and `os.devNull` are refused by Git for Windows
  2.56.0.windows.1 (upstream regression git-for-windows/git#6449, fixed in
  2.56.0.windows.2) and are never used for git. The constant is never handed to
  a Node file open, which would create a real file. A ratchet scan fails on a
  win32 `NUL` literal assigned to a git environment or `-c` value. Protected
  sites change through the signed package route that already governs them; R7
  grants no exception.
- **Diagnosable failure (T1).** A repository-discovery or governance-scope
  failure reaches the preflight envelope (`pipeline-governance-unverifiable`
  and every other surface that reports `GS-GIT-UNAVAILABLE`) with a bounded,
  path-redacted `cause`: the git exit code, the first stderr line and the
  existing topology diagnostic fields. The envelope also carries a typed
  read-only `nextAction` (`diagnose-git`, `mutation: false`) that runs the same
  hardened git probe and prints the git version, exit code and first stderr
  line. A bare diagnostic code without the cause is a defect.
- **Pre-ready diagnostic set (T2).** In the pre-ready state the guard admits a
  closed catalogue of read-only diagnostic entries (§21.1): `diagnose-git`, the
  preflight, and a Pipeline-owned read-only report returning the effective
  hardened git environment, the repository-discovery result and the worktree
  list (credential-root values redacted), so no raw `git config` or `git
  worktree list` is needed. In-root directory Grep and Glob are admitted in the
  pre-ready state exactly as R2 defines them. `node -e`, scratch-script
  execution and every write form stay refused, with the §21.1 truthful denial.
  The set is diagnostic only and changes no admission.

Typed repair: `diagnose-git` (agent-executable). A git version in the
known-bad table of R7-7 additionally yields the attended prerequisite naming
the fixed version.

Acceptance cases (all in the §22.0 matrix):

- R7-1a: A stub git that exits 128 with `unable to access 'NUL': Invalid
  argument` for any `NUL`-like value (and succeeds for `/dev/null`) mimics the
  Git for Windows 2.56.0.windows.1 regression. Every Pipeline git spawn site
  succeeds against it. A fixture that reintroduces a win32 `NUL` literal for a
  git value fails the ratchet scan. A real-git spawn with the constant exits 0
  on every dialect the fixture host offers.
- R7-1b: A stub git whose discovery fails yields a preflight envelope with
  `cause` (exit code, first stderr line, no host path) and the `diagnose-git`
  `nextAction`; an envelope with only the bare code fails the test. The
  `nextAction` has `mutation: false`.
- R7-1c: With the preflight not ready, every catalogue diagnostic entry and
  in-root directory Grep/Glob are admitted, while `node -e`, a `scratch/`
  script, `git config --global …` and `git stash pop` stay refused with their
  typed codes.

### 22.2 R7-2 — Orphan session descriptors

Rows owned: T3.

Contract:

- **Definition.** An orphan is a session descriptor whose owning session the
  Pipeline itself recorded as ended (a recorded session end, or the §20 native
  owner observation reporting not-live) and that holds zero authority: no armed
  override capability, no continuity registration (authoring or dispatch), no
  open ceremony request, no held lock.
- **Archive, not delete.** The preflight reports each orphan with a typed
  `nextAction` (`archive-orphan-session`, `mutation: true`,
  `requiresConfirmation: false`, no `--by` PO actor). The action moves the
  descriptor to the archive with its bytes preserved and a receipt recorded. It
  grants no authority and leaves State, `activeFeature`, proofs and history
  unchanged (the §20.2 exclusions).
- **Never inferred; two routes by owner state (PO decision 2026-10-07 #24).**
  The zero-click route above applies only where the owner is positively
  `not-live` (the §20 native owner observation) or recorded `ended` by the
  Pipeline itself. A descriptor whose owner observation is `unavailable` (V2
  null runtime) or `unobserved` (V1 absent) is never archived by that route and
  its owner is never inferred dead. For such a descriptor with zero authority
  the route is the shipped attended orphan-archive route
  (`plugins/pipeline-core/scripts/session-cleanup.mjs archive-orphan`: one PO
  confirmation with `--by` attribution, no signature), which stays as shipped
  and which R7 does not change. That confirmation is a recovery act, the typed
  attended prerequisite (RV-11) the PO clears, and sits outside the happy-path
  count of §21.0 as the §20.1 attended route does; it is not a signature class
  and not a per-feature or one-time-onboarding decision. A descriptor that holds
  any authority is archived by neither route: the result is the typed attended
  prerequisite (RV-11) and the §20.2 signed legacy-custody transaction stays the
  only attended route for it. R7-2 adds no PO click to the happy path and does
  not weaken §20.

Typed repair: `archive-orphan-session` (agent-executable, owners positively
`not-live` or `ended`), or the RV-11 attended prerequisite: the shipped
`archive-orphan` confirmation for a zero-authority descriptor of an
`unavailable` or `unobserved` owner, the §20.2 transaction for a descriptor that
holds authority.

Acceptance cases (§22.0 matrix):

- R7-2a: Two descriptors of an ended session with zero authority are archived
  by the typed action with no PO input; the archived bytes are identical to the
  originals, a receipt exists, and the State digest is unchanged.
- R7-2b: (i) A zero-authority descriptor with a null owner runtime
  (`unavailable`) and one with the owner field absent (`unobserved`) are not
  archived by the typed zero-click action: each returns the typed attended
  prerequisite naming the shipped `archive-orphan` route (one confirmation with
  `--by`, no signature) and zero mutation occurs; the shipped route then
  archives each with preserved bytes and a receipt, and no signature is
  requested. (ii) A descriptor with an armed capability and one with a
  registered authoring dispatch are archived by neither route; each returns the
  typed attended prerequisite naming the §20.2 transaction and zero mutation
  occurs. (iii) The R3-1 happy-path counts of scenarios A–D are unchanged: the
  attended confirmation appears only in these recovery fixtures.
- R7-2c: The preflight lists the orphans with the `nextAction` (positively
  ended owners) or the attended prerequisite (other owner states), and executing
  the `nextAction` twice is a no-op the second time.

### 22.3 R7-3 — Digest-bound artifacts are tracked and travel

Rows owned: T5, T12.

Contract:

- **Classification (T5).** Every artifact that an approval, signature, gate
  receipt or State record binds by digest (the bound set) is durable evidence.
  Its home is `specs/<feature-id>/evidence/` or another tracked home ADR-0063
  names (`backlog/evidence/` or `specs/*/evidence/`), never the ignored root
  `evidence/`, which is for artifacts regenerable bit for bit from tracked
  inputs. The implementation wave amends ADR-0063 to say so in the same
  package. The design-course producer and the design-workflow package writer
  write the package and the course and readiness artifacts it digests under
  the tracked prefix. The R1 catalogue (K5-8) admits exactly those declared
  paths and no other `evidence/` path; Plan and Spec immutability is unchanged.
- **Refuse before the signature.** `present-plan` and approval refuse, before
  the PO signs, when any bound path is git-ignored, untracked or modified
  against `HEAD`, with the distinct typed codes `DWP-BOUND-PATH-IGNORED`,
  `DWP-BOUND-PATH-UNTRACKED` and `DWP-BOUND-PATH-MODIFIED`.
- **Handover and close (T12).** The handover and close checks list every
  digest-bound path found in State and gate receipts with its status
  (`tracked`, `ignored`, `untracked`, `modified`), and fail on any status other
  than `tracked`. The handover also names the device-local, non-travelling
  artifacts (private state, dispatch records, Verify snapshots) as such, so a
  second device is never a surprise.
- **Legacy approvals.** An existing approval whose bound path is in the ignored
  root is reported by bootstrap as a finding (R7-7) and routed to R7-5.

Typed repair: `DWP-BOUND-PATH-IGNORED` → re-run the producer with the tracked
output prefix; `DWP-BOUND-PATH-UNTRACKED` and `DWP-BOUND-PATH-MODIFIED` → the
ordinary exact-path stage and commit (§21.5 trailer grammar). Both are
agent-executable.

Acceptance cases (§22.0 matrix):

- R7-3a: `present-plan` refuses an ignored, an untracked and a modified bound
  path with its own code and typed repair, and accepts a tracked, clean one.
- R7-3b: The producer fixture writes the package and the digested artifacts
  under the tracked prefix. After a fresh clone of the committed fixture (no
  ignored file, fresh private state) the approval's digests verify.
- R7-3c: The close check lists every bound path with its status and fails on
  one untracked path; the handover output lists the device-local artifacts.
- R7-3d: A ratchet test enumerates every State field that names a bound path
  and fails on any field without a classification.

### 22.4 R7-4 — Write admission with an unverifiable approval, and state commits

Rows owned: T6, T11.

Contract:

- **Backlog and documentation writes in every lifecycle state (T6).** A
  refusal caused by an unverifiable or missing approval package
  (`DWP-PACKAGE-PHYSICAL` and its class) refuses implementation writes only.
  Writes under `backlog/`, `docs/` and `scratch/` stay admitted in every
  lifecycle state the State schema defines, including implementation with an
  unverifiable approval. Every other guard applies to those paths unchanged:
  protected baseline, design-authority sealing of approved PRD/Spec bytes,
  credential roots and documentation governance classification.
- **State commit through its own writer (T11).** The sanctioned lifecycle
  writer records, for each change it writes to `project/pipeline-state.json`, a
  receipt (path, digest of the written bytes, verb, time) in private state. The
  commit guard admits, in every lifecycle state, a commit whose changed-path set
  is exactly `project/pipeline-state.json` and whose staged blob digest equals
  the latest writer receipt. A hand-edited blob, any further path in the same
  commit or a missing receipt is refused with a typed code naming which. No new
  trailer form exists; the §21.5 grammar applies. This route admits no hand edit
  of State.

Typed repair: for a refused implementation write, the R7-5 `rebind-approval`
route; for a refused state commit, re-running the writer verb and committing
the exact path.

Acceptance cases (§22.0 matrix):

- R7-4a: A table-driven fixture enumerates the lifecycle states from the State
  schema. With the bound package absent, a Write to `backlog/items/*.md`,
  `docs/*.md` and `scratch/*` is admitted in every state; a production-path
  write is refused with `DWP-PACKAGE-PHYSICAL` and the typed repair; PRD/Spec
  bytes and a credential root stay refused.
- R7-4b: In design/draft, awaiting-approval and implementation, a commit of
  exactly the writer-produced `project/pipeline-state.json` is admitted. A
  hand-edited blob, an extra path and a missing receipt are each refused with
  their own typed code.

### 22.5 R7-5 — Rebind an approval on another device

Rows owned: T7.

Contract:

- **Route.** For an approval that cannot be verified on the current checkout,
  `inspect` offers a typed `rebind-approval` action next to `reopen-design`,
  not only `reopen-design`. The action compares every digest the approval binds
  (PRD, Spec, the bound set of R7-3, the candidate ancestry) with this
  checkout's tracked bytes.
- **`verified`.** When every bound digest is equal and every bound path is
  tracked and present, the approval is accepted on this device with zero
  signatures and zero State change. Only a device-local verification receipt in
  private state is written. The approval record stays byte-identical.
- **`digest-set-changed`.** When PRD or Spec bytes differ, the route refuses;
  the final plan approval is then the only signature and is requested once, as
  in §21.0.
- **`DWP-REBIND-ARTIFACT-LOST` (decided, PO decision 2026-10-07 #25).** When PRD
  and Spec are unchanged but a bound artifact exists only on an unreachable
  device, the Pipeline never regenerates the artifact and treats it as equal
  (its bytes embed `createdAt` and host-observed digests, so they are not
  reproducible). The result is the typed attended prerequisite: retrieve the
  bound bytes from the origin device, or re-approve. A re-approval after a lost
  bound artifact does not reuse earlier course or readiness evidence bound to
  the unchanged PRD/Spec digests: the route fails closed and reuses nothing, so
  the evidence is produced again by a repeated course before the re-approval.

Typed repair: `rebind-approval` (agent-executable, no signature on `verified`);
the attended prerequisite for the other two outcomes.

Acceptance cases (§22.0 matrix):

- R7-5a: A clone of an approved, committed fixture with tracked bound set
  reaches `verified` with zero signatures; the approval record bytes and the
  State digest are unchanged.
- R7-5b: A changed PRD or Spec byte yields `digest-set-changed` and no rebind.
- R7-5c: A bound artifact absent from the clone yields
  `DWP-REBIND-ARTIFACT-LOST` with the attended prerequisite; no artifact is
  regenerated and no prior evidence is reused.

### 22.6 R7-6 — Signing readiness: key directory and a read-only probe

Rows owned: T14, T15.

Contract:

- **One machine-wide key directory (T14).** `poKeyDirectory` is one value per
  OS user account, stored outside every repository and outside `.git`. Ceremony
  preparation and `sign-intent` resolve it in this order: explicit argument, the
  machine-wide value, the legacy per-repository private-state value (read-only
  fallback, reported as legacy), absent. When it is absent the result is the
  typed `SIGN-KEY-DIRECTORY-UNSET` (probe class `key-directory-unset`) with a
  typed setup action (`set-po-key-directory`, `mutation: true`, no signature)
  taking the value the PO states in chat; the setting grants no trust, because
  signatures still verify only against the committed trust anchor. The agent
  never lists or reads the key directory (the §21.2 credential-root list is
  unchanged). A key that matches no anchor is the attended one-time key setup of
  §21.0, not a new act.
- **The Pipeline chooses no signing executable (T15).** `sign-intent` keeps
  spawning the bare name `openssl` with `shell: false` (`command()` in
  `po-human-approval.mjs`). The executable that receives the PO's private-key
  path and runs the passphrase prompt is therefore the one the platform's own
  name lookup finds on the PATH of the PO's attended signing terminal, an
  environment the PO owns. The Pipeline never selects, configures, pins or
  stores a path for a signing executable and never spawns one by a
  Pipeline-chosen path, because a Pipeline-chosen executable would receive the
  PO's key. The signing spawn and the probe below use one spawn helper whose
  executable is the constant `openssl`; it has no executable parameter, so no
  code path can hand it another one (R7-6e).
- **Neither spawn can start an executable from the working directory or from
  any repository.** On win32 a bare-name spawn can resolve the name in the
  current directory before the PATH, so a file named `openssl.exe` or
  `openssl.com` in the directory the PO signs from would receive the PO's key
  path and passphrase prompt (defect record:
  `backlog/items/2026-10-07-sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows.md`).
  The spawn helper therefore (i) runs both spawns with an explicit working
  directory outside every repository working tree, never the process's
  inherited one: the PO key directory for the signing spawn (it already
  receives the key path there) and the OS user's home directory, a directory the
  Pipeline does not write, for the probe (which passes no key path to any
  process); and (ii) on win32 sets `NoDefaultCurrentDirectoryInExePath` in the
  child environment, so the bare-name lookup skips the current directory.
  Neither measure selects an executable: the name stays the constant `openssl`
  and the PATH of the PO's signing terminal stays the only source. The ceremony
  hand-over text also tells the PO to run `sign-intent` from a neutral
  directory outside every repository (defence in depth for an install that
  predates this fix).
- **Decision #18 is delivered as detection and a PO-applied repair.** PO
  decision 2026-10-06 #18 (`design-input.md`) asks for the signing toolchain to
  be checked before a ceremony and "resolved by the Pipeline itself". R7-6
  delivers it as detection and a typed repair that the PO applies in their own
  terminal, not as a Pipeline-resolved executable, because a Pipeline-chosen
  executable would receive the PO's key (rationale: the independent Critic
  rounds 1 to 3 of 2026-10-07). This reading of decision #18, to probe and not
  to choose, was decided by the PO (decision 2026-10-07 #20).
- **The signing-readiness probe (read-only).** One probe with three steps:
  - (a) *Resolve:* it starts `openssl` through the spawn helper with a harmless
    argument, so the name is resolved by the same lookup the signing spawn uses.
    A start failure is `openssl-not-on-path`.
  - (b) *Capability:* an Ed25519 sign and verify round trip with a throwaway key
    in a temporary directory outside every repository (unique name, owner-only
    where the platform supports it), using the same `pkeyutl` sign options as
    `sign-intent`. The directory is removed after a pass and after every
    failure. The round trip touches no PO key and shows capability, not trust. A
    failing round trip is `openssl-no-ed25519`.
  - (c) *Key directory:* the setting resolves, by the order of the first bullet,
    to an existing readable directory, and the digest of the public key found
    there equals one recorded in the committed trust anchor. The probe reads the
    public key and the anchor and never opens the private key file.

  Each step reports as a §22.7 finding (`signing-toolchain` for (a) and (b),
  `po-key-directory` and `trust-anchor-match` for (c)) with the closed fields
  `status`, `cause` and `repair`; R7-7 embeds these results unchanged. The
  `cause` of a non-ok result begins with exactly one class below, followed by
  bounded, path-redacted detail (§22.0) and never key bytes. A failing probe
  spawn reports its exit code and a bounded stderr head; the signing spawn
  inherits the terminal for the passphrase prompt, so it reports the exit code
  only. The closed classes, each with the repair its result carries:
  - `openssl-not-on-path` (`attended`): add a directory holding an OpenSSL with
    Ed25519 support to the PATH of the terminal that signs, in that terminal's
    own shell. Where a Git installation is found, derived at run time from the
    resolved git executable (candidate directory names are data, not code), and
    its native `bin` directory holds an `openssl` file (a stat, never a spawn),
    the result names that directory as the candidate to add. It is a
    suggestion: the re-run probe in that terminal is its only test.
  - `openssl-no-ed25519` (`attended`): the `openssl` the lookup finds fails the
    round trip; put an OpenSSL build with Ed25519 support earlier on that
    terminal's PATH (the Git candidate above where one exists) and re-run.
  - `key-directory-unset` (`repairable`): `set-po-key-directory`, naming the
    existing setting `poKeyDirectory` (first bullet).
  - `key-directory-missing` (`repairable`): the stored value names no directory;
    `set-po-key-directory` with the corrected value the PO states.
  - `key-directory-unreadable` (`attended`): the PO makes the directory readable
    to their own OS user.
  - `key-anchor-mismatch` (`attended`): no public key there matches the
    committed trust anchor; the PO points the setting at the directory that
    holds the anchored key, or performs the one-time key setup of §21.0
    (signature class 1).
- **Where it runs.** At plugin install and update, where it is printed and never
  fails the install; at bootstrap, where it is reported with its repair and is
  not gating (R7-7); inside `prepare-for-signature`; and in the PO's signing
  terminal as a readiness check handed over BEFORE the signing command (PO
  decision 2026-10-07 #21; decision #19: a signature attempt never discovers a
  missing or unusable `openssl` first).
  - *Inside `prepare-for-signature`.* A failing probe there means no command of
    any kind is handed over, no signing window starts (§21.3) and no ceremony
    request is created, and the result carries the typed repair. A pass there
    describes only the preparing process's environment, because the preparing
    process and the PO's signing terminal can have different PATHs (T15: the
    shell the agent ran in found `openssl`, the PO's terminal did not); the
    hand-over text says so.
  - *In the signing terminal, before the signing command.* `prepare-for-signature`
    hands the PO a read-only readiness-check command FIRST (`mutation: false`;
    steps (a) to (c) only; no prompt, no key path passed to any process, no
    signature). The signing command is handed over only after that check has
    passed in the same terminal, so a missing or unusable `openssl` ends at the
    check with the typed result and its repair, before any passphrase prompt.
    The signing window (§21.3) starts when the signing command is handed over,
    not at the check. The check is a step inside the one signing interaction
    the PO already has (final plan approval or push approval, §21.0 counting
    rule): the same ceremony in the same terminal, with no decision, no
    signature and no signature class of its own. A passing check records a
    device-local observation bound to the prepared ceremony request (closed
    fields: request identifier, check time, result class; no host path, no key
    byte) in private state, and the signing command is released only against
    that observation; the exact release mechanism is fixed by the
    implementation and pinned by R7-6d. After a repair the agent re-runs
    `prepare-for-signature` (agent-executable), which hands the check over again.
  - *`sign-intent` (defence in depth).* `sign-intent` keeps its own run of steps
    (a) to (c), before any prompt and before any process receives a key path,
    for a PO who skips the check or whose environment changed after it; a failure
    there ends before the prompt with the same typed result and repair. It is not
    the place where a missing or unusable `openssl` is meant to be found first.
- **What the probe never does.** It never reads private key material, never
  passes a PO key path to any process, never spawns anything by an absolute
  path, never changes a setting, a PATH or an installation, and never lets a
  persisted report or receipt carry a host path or a key byte.

Typed repair: `set-po-key-directory` (agent-executable; the key directory only)
for `key-directory-unset` and `key-directory-missing`. Every other class is a
typed attended prerequisite (§22.0) that the PO applies in their own terminal or
key setup; no agent-executable action changes a PATH, installs a toolchain or
names a signing executable.

Acceptance cases (§22.0 matrix: R7-6a…R7-6f each run on the win32 and POSIX
dialects, in the source checkout and in the consumer-layout fixture):

- R7-6a: With the machine-wide value set and the repository value unset, a
  second repository on the same machine resolves it with no new act. With both
  unset the result is `SIGN-KEY-DIRECTORY-UNSET` with the typed setup action;
  after the agent runs it, the `po-key-directory` finding is `ok`. An agent Read
  or Grep of the directory is refused, and no report contains key bytes.
- R7-6b (resolution and capability): (i) With a PATH that lacks `openssl` and no
  Git installation layout, the probe returns `openssl-not-on-path` with the
  generic PATH repair. (ii) With a PATH that lacks `openssl` and a
  Git-distribution layout fixture (outside every repository) holding an
  `openssl` stub in its native `bin` directory, the result is
  `openssl-not-on-path` and names that directory as the candidate (redacted in
  the persisted form); the spawn spy records that the stub was not started; after
  the fixture terminal's PATH is changed to include the directory, the re-run
  probe finds the stub through the PATH and passes. (iii) A PATH stub that fails
  the Ed25519 round trip in each of three ways (non-zero exit on sign, a
  signature that fails verification, no raw-sign support) yields
  `openssl-no-ed25519`. (iv) In every failing case `prepare-for-signature`
  hands over no command, starts no window and creates no ceremony request.
- R7-6c: A failing `openssl` stub yields a result with the exit code and a
  bounded stderr head and no host path; a failing signing spawn reports its exit
  code.
- R7-6d (where it runs): (i) At install and update a failing probe is printed
  with its repair and the install does not fail; at bootstrap it is reported
  with its repair and the preflight status is unchanged. (ii) The T15 replay
  with the readiness check before the signing command (PO decision 2026-10-07
  #21): prepare in an environment whose PATH finds a passing stub; the hand-over
  contains the read-only readiness-check command and not the signing command,
  and its text states that the preparation's pass describes the preparing
  process's environment. Run the check in an environment whose PATH finds no
  `openssl`: it returns `openssl-not-on-path` with the repair, no prompt appears,
  no process is started with a key path, the signing command is never handed
  over and no signing window starts. Re-run it where the PATH finds the passing
  stub: it passes, an observation bound to the request is recorded, and only
  then is the signing command handed over and the window started. A static check
  fails if any ceremony hand-over carries the signing command before that
  observation exists. (iii) Defence in depth: `sign-intent` run in an
  environment whose PATH finds no `openssl` (check skipped, or environment
  changed after it) returns `openssl-not-on-path` before any prompt and starts no
  process with a key path. No case or document names `sign-intent` as the place a
  missing or unusable `openssl` is first found. (iv) The check adds no PO
  decision and no signature class to the §21.0 counting rule or to the R3-1
  scenarios: it is a read-only step of the same signing interaction.
- R7-6e (negative, no Pipeline-chosen executable): a static scan and the spawn
  spy fail on any code path in `sign-intent`, the probe, `prepare-for-signature`,
  install or bootstrap that passes an executable other than the constant
  `openssl` to a spawn, in particular an absolute path or one derived from a
  candidate directory; on any setting, environment variable, catalogue entry
  (§21.1), `nextAction` template or setup action, including
  `set-po-key-directory`, that accepts a signing-executable value; and on any
  stored or persisted signing-executable path or digest. Dynamically, stubs in a
  Git-layout directory, in the repository, in `scratch/` and in the OS temporary
  directory, none of them on the PATH, are never started in any step, and an
  agent attempt to set a signing executable through `set-po-key-directory` or
  any other catalogued verb is refused with a typed code and leaves state
  byte-identical. The static scan stays. A further dynamic case (working-directory
  lookup, defect record
  `backlog/items/2026-10-07-sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows.md`)
  places decoy `openssl.exe` and `openssl.com` (win32) and an executable
  `openssl` (POSIX) in the repository root and in the spawn's working
  directory, runs `sign-intent` and the probe from the repository root with the
  real PATH lookup, and asserts that no decoy starts and that on win32 the child
  environment carried `NoDefaultCurrentDirectoryInExePath`; it also asserts
  that the working directory of each spawn lies outside every repository working
  tree and that the hand-over text names a neutral directory outside every
  repository.
- R7-6f (key directory checks, no private-key read): (i) Fixtures for a matching
  key, a stored value that names no directory, an unreadable directory and a key
  whose digest equals no committed anchor yield `ok`, `key-directory-missing`,
  `key-directory-unreadable` and `key-anchor-mismatch` with the status and
  repair stated above; a fixture host that cannot create the unreadable
  condition reports that case `not-run`, which fails the matrix, and never skips.
  (ii) A filesystem and spawn spy shows the probe opened only the public key and
  the committed anchor, never a private key file (a trap private key in the
  fixture directory is never opened), and started no process with a key path.
  (iii) No result, report, log or receipt contains key bytes or an unredacted
  host path. (iv) The throwaway directory of step (b) lies outside every
  repository and is removed after a pass and after each failure class.

### 22.7 R7-7 — Environment readiness report

Rows owned: T16 (decision 19). Also reports, without owning: T4 and the
findings of R7-2, R7-3, R7-5.

Contract:

- **One read-only report** extends `scripts/toolchain-preflight.mjs` and is
  produced at plugin install and update, at bootstrap (preflight) and before any
  ceremony (R7-6). Each finding has the closed fields `findingId`,
  `status` (`ok`, `repairable`, `attended`, `unknown`), `cause` (bounded,
  path-redacted) and `repair` (a `nextAction` envelope or an attended
  prerequisite, per the §22.0 typed repair rule). A non-ok finding without a
  repair fails its case.
- **Closed finding ids:** `git-version`, `signing-toolchain`,
  `po-key-directory`, `trust-anchor-match`, `git-hooks`, `bound-paths-tracked`,
  `orphan-descriptors`, `approval-verifiable`.
- **Known-bad Git** is a data table shipped with the plugin (id, version
  pattern, upstream reference, fixed version, repair). Its first entry is Git
  for Windows 2.56.0.windows.1. An unknown version is `ok`.
- **Hooks.** `git-hooks` covers the mandatory pre-push, pre-commit and
  commit-msg hooks. Its repair is the agent-executable installation (K6-2),
  with no PO confirmation. A foreign hook is never overwritten and yields the
  attended prerequisite.
- **Visibility, not new blocking.** The report adds visibility and repair; it
  adds no new blocking readiness status. A ceremony start blocks only on the
  findings it needs (R7-6). Install and update print the report and never fail
  because of a finding.

Typed repair: per finding, as above.

Acceptance cases (§22.0 matrix):

- R7-7a: A fixture matrix puts each finding id in `ok`, `repairable` and
  `attended`; the test fails when a non-ok finding has no `repair`.
- R7-7b: A stub `git --version` equal to a table entry yields `git-version`
  `attended` naming the fixed version; an unlisted version yields `ok`.
- R7-7c: The same report content is produced at bootstrap and at
  `prepare-for-signature`; a blocked finding there hands over no command and
  starts no window.
- R7-7d: The report runs from the installed plugin copy in the consumer-layout
  fixture, naming no source-only path.
- R7-7e: A missing pre-push hook yields `git-hooks` `repairable`; running the
  typed action installs it with no PO confirmation; a foreign hook yields
  `attended` and is left unchanged.

### 22.8 R7-8 — Shell-lane parity

Rows owned: T17.

Contract:

- On win32 the Bash and PowerShell lanes give the same refusal outcome for the
  same catalogue command: the same typed code family, the same typed retry
  actions (each rendered for the lane that was denied, `copyCommand.posix` or
  `copyCommand.powershell`) and one override-eligibility class derived from the
  denied argv, not from the lane.
- A PowerShell-lane command the closed grammar cannot parse returns
  `GUARD-POWERSHELL-GRAMMAR` with a typed retry action naming the equivalent
  catalogue command, never "no route". `continuity-cas` and the other
  ceremony-adjacent catalogue commands are admitted or refused identically on
  both lanes. Where no equivalent exists on a lane the result is typed
  `unavailable` and names the lane that works.

Typed repair: the lane-rendered retry action of the denial.

Acceptance cases (§22.0 matrix):

- R7-8a: A table-driven fixture runs every catalogue entry through both lanes
  and asserts equal code family, retry-action argv (modulo lane quoting) and
  override eligibility.
- R7-8b: `continuity-cas` from the PowerShell lane yields the same recovery as
  from the Bash lane.
- R7-8c: An unparseable PowerShell command carries a typed retry action.

### 22.9 R7-9 — Cross-cutting rules and mapped-row replay

Rows owned: none.

Contract:

- **No new authority class.** R7 introduces no signature, confirmation or
  terminal command for the PO beyond §22.0's signature rule, and every non-ok
  R7 outcome obeys the typed repair rule.
- **Mapped-row replay.** For each mapped row the owner's fixture contains a
  named step reproducing the row's scenario, and a test enumerates the T-map
  and fails when a step is missing:
  - T4 (R3-2): an already-onboarded repository cloned to a fresh `.git` gets
    the mandatory hooks through the typed agent action with no PO confirmation
    before the first push.
  - T9 (R5-6): re-registration of an authoring dispatch for a revision cycle
    by the coordinator, with zero overrides and zero signatures. T8 (clearing
    an existing registration so that `submit-plan` can run) is owned by R7-10
    and is not a mapped replay.
  - T10 (R1-1): the agent writes the course outputs under the declared prefix
    in each design phase that emits them (the tracked prefix of R7-3 for bound
    outputs).
  - T13 (R4-1, R4-2): a Claude design course ends through the role-route
    preflight, with no per-course exception rationale when the route is
    `native` or labelled `fallback-self-dispatch`.
  - T18 (R1-1): the R1-1 catalogue enumeration also covers every Pipeline-owned
    preparation script that the dispatch templates and `agent-obligations.md`
    prescribe (the Critic-input strip script `dispatch-record-strip-for-critic.mjs`
    and the Goldfish commit-command producer `goldfish-commit-command-flow.mjs`
    are the named ones). Each is admitted by the guard in every lifecycle state,
    `draft` included, from the repository path and from the installed plugin
    path, with zero overrides and zero signatures; a different script with the
    same basename stays refused.
- **AC-32 is unchanged.** R7 cases are additional. Its host matrix and pass
  rule stay as written, and a device-switch host run is extra evidence, not a
  substitute.

Acceptance cases (§22.0 matrix):

- R7-9a: The device-switch walk. A clone of an approved, committed fixture
  into a fresh directory (fresh private state, no ignored files, no hooks, key
  directory unset, descriptors of an ended session) walks preflight, the R7-7
  report, the typed repairs (hooks, orphan archival, key-directory result), the
  R7-5 `verified` outcome, a `backlog/` write and a state commit, and ends with
  an admitted implementation write. It needs zero PO terminal commands, zero
  overrides and zero signatures.
- R7-9b: A static check fails if any R7 case or doc asks the PO for a signature
  outside the five classes enumerated in the §22.0 signature rule; if AC-32's
  row text changes; if the T-map (the §22.0 table and the T1–T20 map of
  `traceability.md`) lacks a row, has an owner cell naming more than one owner,
  or states owner counts other than 15 R7-owned, 5 mapped and 20 in total; or
  if any catalogue entry, `nextAction` template or setup action accepts a
  signing-executable value (R7-6e).
- R7-9c (T18 replay): the R1-1 enumeration fails when a preparation script
  prescribed by the dispatch templates or `agent-obligations.md` is missing from
  the catalogue, and the two named scripts are admitted in `draft` on the win32
  and POSIX dialects, in the source checkout and in the consumer-layout fixture,
  with zero overrides.

### 22.10 R7-10 — Stale authoring registration: supersede without an override

Rows owned: T8.

Why this contract exists: §21.5 (R5-6) states that the coordinator records
authoring itself and that a design revision keeps the submission lineage. It
does not state what happens to a registered authoring dispatch that already
exists when `submit-plan` has to run and the registration blocks the idle
continuity it needs: one of an earlier revision, or one whose owner has ended.
That is the T8 case, and this section states the obligation. §21 is unchanged.
Whether a registration may be retired is decided only from positive facts the
Pipeline's own records show, never from a guess that its owner is dead (§20.1).
PO decisions 2026-10-07 #22 and #23 widen the eligible set without changing
that rule: supersede is non-destructive (bytes and result namespace archived,
the owner's later integration fails closed), so a supersede that rests on the
digests, the absence of bound authority and, where required, a positive owner
state assumes nothing about an `unobserved` owner. The T8 incident shape (a
registration made on another device, same digests, owner `unobserved` here) is
therefore fixed by an agent-executable action.

Contract:

- **Owner vocabulary (§20.2, RV-1).** The owner of a registration is observed
  as `live` or `not-live` only where platform evidence supports it (the §20
  native owner observation), as `unavailable` (V2 null runtime) or as
  `unobserved` (V1 field absent, or no descriptor of that owner session on this
  device, as on a fresh clone or for a registration made on another device).
  A session end the Pipeline itself recorded is `ended` (R7-2). `unavailable`
  and `unobserved` never mean `not-live`, and owner death is never inferred
  from elapsed time, a reboot, absent result artifacts or a change of device.
- **Eligibility: positive conditions only.** A registration may be superseded
  only when every one of the following holds:
  - it blocks the idle continuity `submit-plan` needs, and its bytes are
    readable with a known schema and a recorded digest (otherwise the result is
    the §20.2 typed `unavailable` naming the read or identity prerequisite);
  - the Pipeline's own records show zero authority bound to it: no armed
    override capability, no open ceremony request, no held lock (an axis
    independent of owner state);
  - and exactly one of three branches applies. (A) Earlier revision: its
    recorded submission lineage equals the current submission's, its recorded
    revision is earlier than the current revision and its recorded authority
    digest set differs from the current submission's: only when its owner is
    positively `not-live` or `ended`. An earlier revision does not by itself
    make a registration eligible: a `live` owner is never superseded, and an
    `unavailable` or `unobserved` owner of an earlier revision with different
    digests is not eligible (PO decision 2026-10-07, the readiness finding on
    branch (A): supersede without a signature stays within decisions #22 and
    #23). (B) A registration of the same lineage at
    the current or an earlier revision that (A) does not cover: when its owner
    is positively `not-live` or `ended`; and, where its recorded authority
    digest set equals the current submission's (the same digests), also when
    its owner is `unobserved`, for instance a registration made on another
    device with no descriptor of its owner here (PO decision 2026-10-07 #22).
    The `unobserved` clause rests on the same digests, the zero-authority
    condition and the non-destructive rule, not on any belief about the owner;
    an `unobserved` owner is still never treated as `not-live`. (C) A
    registration of another lineage, or of a later revision than the current
    one, whatever its digests: only when its owner is positively `not-live` or
    `ended` (PO decision 2026-10-07 #23). An `unobserved` owner under (C), and
    an `unavailable` owner under (B) or (C), are not eligible.
- **Verb.** A catalogue-admitted verb (§21.1, admitted in every phase that
  emits it) supersedes an eligible registration:
  `supersede-authoring-registration`, emitted by `inspect` and the preflight as
  a typed `nextAction` (`mutation: true`, `requiresConfirmation: false`, closed
  `expected.schema`, no `--by` PO actor). The coordinator's own writer runs it,
  so no hand-built `continuity-cas` request, no override and no signature is
  involved. State, `activeFeature`, proofs, the submission lineage and history
  are unchanged.
- **Non-destructive by construction.** The verb retires nothing but the
  registration. The registration's bytes and its result-path namespace (the
  paths its dispatch was to write results to) are preserved and archived with a
  receipt recorded (as in R7-2); no file in that namespace is deleted,
  rewritten or reused by a later registration. The receipt belongs to the
  continuity record, not to device-local state, so every checkout that holds
  the record sees that the registration was retired. A later integration of the
  superseded registration by its owner, live or not, on this or another device,
  is a compare-and-set against the retired record and fails closed with the
  typed result `superseded` naming the receipt: it never silently overwrites
  the current submission, the archive or the namespace, and the registration
  and every result byte the owner produced stay as they were. The owner's work
  then re-enters only through the coordinator for the current revision (R5-6).
- **Refusal and its named route.** A registration that is not eligible is not
  superseded and nothing is mutated; the result is the typed attended
  prerequisite (RV-11), which names its concrete route and never only a code:
  - owner `live`: wait for the owner's terminal record (its session end or its
    integration result as the Pipeline records it); no signature;
  - owner `unavailable`, for any registration: the §20.2 signed legacy-custody transaction (signature class 5), the only
    attended route that does not infer death. It is unnecessary if the owner's
    terminal record arrives first, because the owner is then `ended` or
    `not-live` and branch (B) or (C) applies;
  - owner `unobserved` (including an owner that ran on another device and has no
    descriptor here) for a registration that the same-digest clause of branch
    (B) does not cover (an earlier revision with different digests, another
    lineage, a later revision, or the current revision with different
    digests): the same §20.2 transaction
    (signature class 5), unnecessary if the owner's terminal record arrives
    first;
  - a registration of another lineage, or of a later revision than the current
    one, whatever its digests, whose owner is `live`: the owner's terminal
    record (its own integration result normally closes the registration); with
    an owner `unavailable` or `unobserved`: the §20.2 transaction (signature
    class 5); with an owner positively `not-live` or `ended` it is eligible
    under branch (C) and is not refused;
  - authority held (armed override capability, open ceremony request, held
    lock): wait for the holder's terminal record, that is the consumption,
    expiry or release the Pipeline records for it; no signature;
  - bytes unreadable, linked or ambiguous: the §20.2 typed `unavailable` naming
    the read or identity prerequisite; class 5 applies once the bytes are
    unambiguous.
- **Afterwards.** `submit-plan` runs with zero overrides, zero signatures and
  zero PO terminal commands. Re-registration for a revision cycle stays with
  the coordinator (R5-6, row T9).

Typed repair: `supersede-authoring-registration` (agent-executable) for an
eligible registration; for every other registration the RV-11 attended
prerequisite naming the route above.

Acceptance cases (§22.0 matrix: win32 and POSIX dialects, source checkout and
consumer-layout fixture):

- R7-10a (branch A, earlier revision): a registered authoring dispatch whose
  recorded lineage is the current one, whose recorded revision is earlier and
  whose authority digests differ from the current submission blocks
  `submit-plan`. In each of (i) the owner recorded `ended` on this device and
  (ii) the owner reporting `not-live`, the typed action supersedes it,
  `submit-plan` then succeeds, and the counts of overrides, signatures and PO
  terminal commands are all zero; the archived bytes equal the original, a
  receipt exists and the result-path namespace is preserved. (iii) With the
  owner `live` it is not superseded, zero mutation occurs and the typed
  prerequisite names waiting for the owner's terminal record. (iv) With the
  owner `unavailable`, or `unobserved` (registration made on another device:
  fresh clone of an approved, committed fixture, fresh private state, result
  artifacts absent), it is not superseded, zero mutation occurs and the typed
  prerequisite names the §20.2 class 5 transaction. (v) The owner superseded in
  (i), from a second checkout, then attempts to integrate: the result is the
  typed `superseded` naming the receipt, and the registration, the namespace
  and every result byte it produced are byte-identical before and after, with
  the State digest unchanged by the attempt.
- R7-10b (branch B, same digests; PO decision #22): (i) a registration with the
  same digests whose owner ran on another device and is `unobserved` here (fresh
  clone of an approved, committed fixture, fresh private state, result artifacts
  absent) is superseded by the typed action with zero overrides, zero
  signatures and zero PO terminal commands, the archived bytes equal the
  original, a receipt exists and the result-path namespace is preserved; the
  owner, integrating afterwards from a second checkout, gets the typed
  `superseded` with the bytes preserved. (ii) The same registration with the
  owner `unavailable` (V2 null runtime) is not superseded: the result is the
  typed attended prerequisite naming the §20.2 signed legacy-custody
  transaction (class 5), and zero mutation occurs. (iii) The same registration
  with its owner recorded `ended` (or reporting `not-live`) is superseded with
  the same zero counts and the same preserved bytes, receipt and namespace.
  (iv) The owner of (iii), attempting to integrate afterwards, gets the typed
  `superseded` with the bytes preserved. In every case elapsed time, a reboot
  and absent result artifacts alone never make an owner `not-live`; (i) rests
  on the same digests, not on that.
- R7-10c (refusals, each with its route): each of the following is not
  superseded, returns the typed attended prerequisite naming its concrete route
  and causes zero mutation: (i) same digests and a `live` owner: waiting for the
  owner's terminal record; (ii) an armed override capability, an open ceremony
  request or a held lock on an otherwise eligible registration, including one of
  an earlier revision: waiting for the holder's terminal record; (iii) a
  registration of another lineage, or of a later revision of the same lineage,
  whatever its digests (PO decision #23), with its owner in each of the states
  `live`, `unavailable`, `unobserved`, `not-live` and recorded `ended` (one
  fixture per combination): with the owner `not-live` or `ended` it is
  superseded under branch (C) with zero overrides, zero signatures, zero PO
  terminal commands, preserved bytes, a receipt and the preserved namespace;
  with the owner `live`, `unavailable` or `unobserved` it is not superseded,
  zero mutation occurs, and the typed prerequisite names the owner's terminal
  record where the owner is `live` and the class 5 transaction for the other two
  owner states; (iv) unreadable, linked or ambiguous registration bytes: the
  §20.2 typed `unavailable` naming the read or identity prerequisite. A static
  check fails on any R7-10 refusal that names neither route, and on any
  signature request outside class 5.
- R7-10d: Running the action twice is a no-op the second time, which returns a
  typed result naming the receipt, and the PowerShell and Bash lanes give the
  same result (R7-8).

### 22.11 R7-11 — Parallel dispatch is supported

Rows owned: T19, T20 (PO decision 2026-10-07 #26).

Why this contract exists: parallel subagent dispatch is a required, supported
mode on every runner and platform (decision #26). The dispatch-budget
accounting must never refuse a call only because another call holds its lock,
and a subagent's bootstrap must not depend on the spelling of the preflight
command.

Measured facts (source read 2026-10-07 of
`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`; they describe the
defect and are not a design):

- The hook keeps one counter and one binding lock per agent: `counterPath`
  returns `dispatch-budget/<agentId>.json` under the git common directory and
  the lock is `<counter path>.binding.lock`. Different agents therefore never
  share a lock. The corrected T19 finding is that parallel DISPATCHES of
  different agents do not contend, while parallel TOOL CALLS of ONE agent do.
- `acquireDispatchBudgetCounterLock` returns `counter-lock-busy` immediately
  when a live owner holds the lock, and the caller turns every non-acquired
  result into `invalidBudgetInputBlocked` (`DISPATCH-BUDGET-INPUT-INVALID`)
  with no retry, although the code comment states that this contention "must
  remain retryable by the caller". A second parallel call of one subagent is
  therefore refused, reads included.
- A subagent's bootstrap receipt is recorded only by a preflight whose spelling
  the draft-phase guard admits (T20).

Contract:

- **Wait, then count once.** A call that finds the counter lock held by a live
  owner waits with bounded backoff and then proceeds; it does not return
  `counter-lock-busy` to its caller. The total wait is bounded by a ceiling of a
  few seconds; the exact value is fixed by the implementation, exported as a
  named constant and pinned by a test (R7-11d). Every call that obtains the
  lock, at once or after waiting, is counted exactly once against the working
  cap; a refused or timed-out call is never counted. The cap, closing-act and
  grant rules are unchanged.
- **Typed timeout.** Only after the bound expires is the call refused, with the
  typed code `counter-lock-timeout`, which names the holder's age (bounded,
  path-redacted) and carries the typed repair: retry the call (the holder
  releases the lock when its own call completes), or, where the holder's owner
  record is provably dead, the existing dead-owner reclaim path. A malformed,
  unsafe or ambiguous lock stays fail-closed under its existing codes; waiting
  applies only to a live owner and to the publishing transition the source
  already calls retryable.
- **Isolation between agents.** Locks and counters stay per agent. A held lock
  of one agent never delays or refuses a call of another, and parallel
  dispatches of different agents each keep their own counter and cap.
- **Receipt at SubagentStart (T20).** A subagent's bootstrap receipt is recorded
  at `SubagentStart` (PO decision "bootstrap receipt option B" of
  `specs/sprint-alfred-epic/plans/po-decisions-2026-10-06.md`), so the receipt
  gate does not depend on any preflight spelling and briefings need no exact
  spelling. A runner without a `SubagentStart` event gets a typed `unavailable`
  naming its route, never a silent gap (§21.0).
- **Protected site.** `guard-dispatch-budget.mjs` changes through the existing
  protected-site route (§22.0 signature class 4) where it is a protected-baseline
  surface; R7-11 grants no exception and no new signature class.

Typed repair: retry, or the existing dead-owner reclaim, for
`counter-lock-timeout`; no PO act and no signature.

Acceptance cases (§22.0 matrix: R7-11a…R7-11e each run on the win32 and POSIX
dialects, in the source checkout and in the consumer-layout fixture):

- R7-11a: N (at least 4) concurrent tool calls of one fixture subagent are all
  admitted and the counter advances by exactly N (no lost update, no double
  count); none returns `counter-lock-busy` or `DISPATCH-BUDGET-INPUT-INVALID`.
- R7-11b: A lock left by a crashed holder (provably dead owner record) is
  recovered through the existing dead-owner path without waiting out the bound;
  the call is admitted and counted once; a malformed lock stays fail-closed.
- R7-11c: Two agents dispatched in parallel, each making concurrent calls, keep
  separate counters and caps; a lock held for agent A leaves agent B's call
  admitted with no wait.
- R7-11d: A lock held by a live owner beyond the bound yields
  `counter-lock-timeout` naming the holder's age; nothing is counted and no
  counter changes; the measured wait is above zero and not above the named
  constant plus scheduling tolerance; a holder that releases within the bound
  lets the call through, counted once.
- R7-11e: The first Write of a freshly started subagent, whose bootstrap receipt
  was never produced by any preflight call, is admitted in the draft phase; the
  receipt is recorded by `SubagentStart`.

### 22.12 Sequencing and completion

R7-1, R7-2 and R7-11 join step 1 of §21.7 (R7-1 and R7-2 unblock bootstrap on a
second device; R7-11 removes a refusal every parallel dispatch of the later
steps would hit). R7-3, R7-4, R7-5, R7-8 and R7-10 join the R1 catalogue work
and step 3 (R7-3 lands before R5 finalises the course outputs it writes; the
R7-10 verb is a catalogue entry shared with the R5 coordinator). R7-6 and R7-7
join the R3 slice and the hook-and-commit-policy integration slice. R7-9a is
part of the final integration. R7 is complete only when R7-1a…R7-9c,
R7-10a…R7-10d and R7-11a…R7-11e pass in the source checkout and in the
consumer-layout fixture on both dialects.
Independent Critic review, Verify, security and PO acceptance remain separate
gates.
