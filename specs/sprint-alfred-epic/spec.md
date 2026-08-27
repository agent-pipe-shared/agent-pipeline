# Sprint Alfred Epic — Technical Specification

Design-gate revision. Per-WP implementation plans are authored under
[`plans/`](plans/) during the implementation waves, as in the Nova package;
this document fixes the contracts those plans implement. PRD:
[`prd_sprint-alfred-epic.md`](prd_sprint-alfred-epic.md).

## 1. Bound authority and scope

- Scope authority: ADR-0043 (2026-08-17 amendment); membership authority:
  GitHub #108. Issues #99, #101–#106, #109 plus the 24 open `sprint: alfred`
  backlog items per [`design/backlog-intake.md`](design/backlog-intake.md).
- Design base `a50c8093` on `feat/sprint-alfred`; implementation base is the
  post-Nova `origin/main` after rebase (PRD §5 wave 0).
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

Freeze rules: a revision bump after freeze is a PO-visible decision recorded
in the freeze artifact's own append-only `revisions[]`; consumers pin the
digest they were built against; E2 verifies all pins agree at qualification.
C2's consolidation fields on the registration schema (`invariantPinned`,
`nonOverlapNote`, §6.2) are a pre-declared revision of exactly this kind,
landed through that `revisions[]` mechanism when C2 ships — not an unpinned
mid-sprint shape change.

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
registration and lands a wave later) — so the replacement is one contiguous
edit performed through the existing human-guard-override signature ceremony,
scheduled inside A1's own Wave-0 slot; no new authorization route is designed
or required for it. Probe re-runs are cheap and mandatory on runner/plugin
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
  (`selected vs derived`) until the C1 dogfood window completes; promotion
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
corrected value; `backlog-item-strip-for-dispatch.mjs` strips only the
Triage section body (next-`##`-heading boundary), with the later-sections
fixture from the item.

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
- **Dogfood clock:** first wave lands it; `interruption-baseline.json`
  records window start; B1 promotion and D2 thresholds mechanically require
  `windowDays >= 14` from that artifact (#103's rule as a check, not a
  memory).

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

After ≥14 dogfood days: report over C1 receipts + Verify durations
comparing per-dispatch vs collection-block cadence cost for the sprint's own
waves; close the cadence item per its own acceptance text (evidence-backed
recommendation, policy already encoded).

## 7. Track D — Agent-first architecture capability

### 7.1 D1 — Architecture decision continuity (#99)

**Deliverables:** significance rubric + assessment
(`plugins/pipeline-core/scripts/architecture-baseline.mjs`), decision skill
(`plugins/pipeline-core/skills/architecture-decision/`), decision-record
schema, close-path impact recording, adoption flow, fixtures.

- **Rubric:** deterministic checklist over the five #99 significance axes;
  output one of `initial-adr-required | architecture-baseline-sufficient |
  no-material-architecture-decision`, evidence-bound (which axis fired).
- **Decision records:** `pipeline.architecture-decision.v1`
  `{id, status: proposed|accepted|superseded|waived, digest, scope,
  supersedes?, exception?: {authority, rationale, scope, expiry}}` stored in
  the governed repo's `docs/adr/` (existing convention; the schema is a
  frontmatter/JSON sidecar, not a new directory kind — ADR-0063 respected).
- **Inherited layers:** resolver consumes configured org/team sources
  through #9's interface *when configured*; unconfigured ⇒ Pipeline+project
  layers, typed `org-source: none`. Follow-by-default / human-waiver
  semantics exactly per #99 §4 conflict table; waivers are decision records
  with `exception` filled, PO-authored (D-track shares B2's
  signature-or-chat ceremony for the authorship act).
- **Session consumption:** a compiled decision summary
  (`project/architecture-decisions.compiled.json`: ids, one-line summaries,
  applicability, status, active exceptions) bounded in size, regenerated by
  the assessment script, read at bootstrap — never the full ADR estate.
- **Close impact:** typed enum per #99 §6 recorded via
  `ritualExtensions.close.pre` (intake deviation: no second close path).
- **Adoption:** present-state baseline acceptance per #99 §8 — inventory,
  human approval, forward-looking ADRs only.

### 7.2 D2 — Agent-first architecture standard (#104)

**Deliverables:** the shipped profile
(`plugins/pipeline-core/architecture/agent-first-profile.v1.json`), module
inventory + navigation bundle conventions, receipt emitters, profile
resolution, fixtures.

- **Profile:** the nine #104 property classes as versioned machine-readable
  properties `{propertyId, class, declaration | signal | check,
  measurementStatus semantics, blocking: advisory-first}`. First-increment
  honesty rule (intake deviation): properties whose measurement needs
  runner-side telemetry that A1 shows unavailable are declared with
  `signal: unavailable-on-<runner>` rather than fake numbers.
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
- **Module inventory:** `pipeline.module-inventory.v1` rows exactly per
  #104's governed-inventory list; provisional identities allowed and marked
  until D1 acceptance.
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
  (armed only post-C1-window).
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
- The A1 probe deliberately attempts guard-refused shapes: probe fixtures
  run in disposable fixture repos, never against live protected files; the
  payload-indirection probe writes only to `scratch/`.
- Residual accepted gaps stay visible: `git push --no-verify` (PO-accepted
  2026-08-27), post-hoc-only rows in the A2 table, `prose` declarations.

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
- The 21-fixture list of #106, the 14-fixture list of #105, the #101/#102
  lists, and the four C1 seed classes are the minimum fixture inventory;
  `acceptance.md` maps each to its suite.
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

- **Implementation-ready:** PRD/Spec PO-accepted; submission/approval bound;
  phase `implementation`; Nova rebase done; #100 resolved per PO decision
  (PRD §9.3); E1 freeze artifact committed.
- **Wave-complete:** each wave's WPs green in Verify + Critic-reviewed with
  documented fail-then-fix cycles; PO-visible wave summary.
- **Epic-complete:** PRD §7 list; every S1–S7 evidenced on one exact
  candidate; all member issues + in-scope backlog items closed or
  re-triaged PO-visibly; sprint close comment per #108.

## 14. Traceability

PRD §4 tracks ↔ this spec §4–§8 one-to-one; issue/backlog mapping in the
intake docs is normative for "which requirement lives where"; acceptance
mapping in [`acceptance.md`](acceptance.md).

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
7. **Postponing C1 to a later wave:** rejected — its 14-day window is the
   critical path for every threshold-dependent promotion; landing it late
   forces either waiting or waiving #103's rule.
