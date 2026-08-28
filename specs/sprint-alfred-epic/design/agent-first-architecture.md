# Agent-first architecture — the doctrine (design analysis, 2026-08-28)

**Why this document exists.** The first PRD gate (2026-08-28) found the
design far too shallow on Alfred's primary mandate: it *named* the
architecture capability (profiles, evaluators, schemas) without stating what
good agentic architecture **is**, how it is **documented for machines**, how
it is **enforced**, and how it is **shown to humans**. This document absorbs
the elementary requirements of #99, #104, #106, and #109 (read in full from
`../evidence/issues-snapshot-2026-08-27.md`) plus the external research into
the design's own text. Its normative core graduates into `spec.md` §7 and the
PRD in the rework step (`gap-analysis-2026-08-28.md` §D carries the exact
integration map); this file remains the argued analysis behind those edits.

Grounding convention: every section names the issue text it derives from.
Nothing here is invented beyond the issues + research; where this design
adds, the addition is marked **[design addition]** with its rationale.

---

## 1. The premises — what makes architecture "agent-first" (#104, research)

**P1 — The organizing force shifts.** Classical architecture guidance
optimizes for human team topology, communication cost, and long-lived
individual comprehension. Those concerns stay relevant wherever humans
maintain the system, but they are no longer the primary organizing force.
Agent-first architecture organizes around **durable information, authority,
side-effect, contract, and verification boundaries** (#104 Problem,
verbatim): the boundaries that determine whether a *stateless, context-
budgeted* worker can re-enter, change, and verify a bounded surface.

**P2 — The repository is the memory.** A fresh session must "re-establish
sufficient context, change a bounded surface, and verify the result without
loading or rediscovering unrelated implementation" (#104). Everything a
session needs to re-enter — structure, contracts, decisions, next actions —
must exist as durable, machine-readable, *bounded* artifacts. Conversational
memory, transcripts, and per-session rediscovery are explicitly not carriers.

**P3 — Prose is not a control.** Prompt instructions, role text, ADR
paragraphs, generated architecture documents, and model self-attestation are
advisory context with **no gate value** (#104/#106, verbatim; research §3:
the industry's spec-driven tools — Spec Kit, Kiro, OpenSpec — share exactly
this gap: constitutions enforced at prompt level). Every architectural
property must exist as a versioned machine-readable **declaration**, an
observable **signal**, or a deterministic **check** — and only the check
class can ever produce `pass`.

**P4 — Boundaries must support parallel agents.** Multiple concurrent
work packages are the normal delivery mode, so boundaries carry explicit
contracts, *controlled* overlap, deterministic integration evidence, and no
implicit shared-write authority (#104 property 8).

**P5 — The human stays root authority.** Custom profiles, overrides,
waivers, baseline acceptance, and adoption decisions are durable PO acts.
Agents propose them and supply evidence; they can never approve, broaden,
extend, expire, or infer them (#104 override, #105 asymmetry, #106 §6,
#109 §3).

---

## 2. The property catalog — the best practices, concretely (#104 §1–§9)

The nine properties below ARE the standard. For each: the definition
(issue-grounded), why it matters specifically for agents, the evidence form
in the first increment (declaration / signal / check — with honest
measurement status per spec §2.1), and where it is enforced (evaluated-class
mapping in §2.10; boundary placement in §4).

### 2.1 Context locality

A bounded task obtains sufficient context from the module's **declared
contract, the architecture map, and its directly owned surface** — without
routinely loading unrelated implementation. Measured (per #104): modules and
files consulted; interface/contract reads vs. foreign implementation reads;
cross-module traversal; wall time to sufficient context; runner-reported
context/token dimensions where available — every metric status-carrying
(`measured | estimated | unavailable | unknown`; absent telemetry is never
zero). *Why:* context is the agent's scarcest resource; an architecture that
forces foreign-implementation reads taxes every single task, forever.
*First increment:* **signal** — receipts derived from briefing surface,
candidate diff, and transcript tool logs where the runner exposes them;
`unknown` where it does not (the measured subagent-telemetry gap on Claude
Code makes anything else dishonest — intake deviation, A1).

### 2.2 Contract sufficiency

Every governed module exposes enough **stable, current** information for
another session to use or modify it safely: responsibility and
non-responsibilities; public inputs, outputs, invariants, errors, and side
effects; dependency and authority boundaries; compatibility and lifecycle
expectations; verification entry points; and the exact
implementation↔contract revision binding (#104 §2, complete list). A prose
description alone is not sufficient — presence, identity, freshness,
coverage class, and implementation agreement require mechanical evidence.
*Why:* the contract is what lets a session **skip** reading the
implementation; every missing field converts to foreign reads (2.1) or to
wrong assumptions surfacing as review findings. *First increment:* **check**
(contract exists, digest matches inventory revision — D3 class 2) plus
**signals** for contradiction-with-implementation and staleness.

### 2.3 Change locality

A normal bounded change stays predominantly inside one declared module or an
explicitly planned small boundary set. Measured: late write-scope expansion,
unrelated module edits, hidden dependency discovery, cross-boundary
correction work, architecture-related review findings (#104 §3). *Why:*
write-scope creep is how dispatched work silently exceeds its briefing; it
is also the direct rigor input (#105: late expansion escalates or
reauthorizes, never self-approves). *First increment:* **check** — the
actual candidate diff compared against the planned/authorized boundary set
(D3 class 4; diff-derived, runner-independent).

### 2.4 Dependency legibility

Dependencies are explicit, directional, graphable, and evaluated against a
closed profile. Cycles, forbidden direction, implicit global access, and
undeclared cross-module reach are mechanically detectable **where the
configured analyzer contract claims coverage** (#104 §4). *Why:* an agent
cannot "just know" the dependency intent the way a long-tenured human does;
direction rules are the difference between a plannable change and an
archaeology dig. *First increment:* **check** via language-scoped
import-graph adapter with explicit `unsupported` for uncovered languages
(D3 class 3) — never a pretended universal analyzer.

### 2.5 Authority and side-effect locality

Filesystem, network, credential, state, deployment, and other consequential
effects are owned by explicit boundaries; a module's contract states which
effects it can request or perform; **prompt intent cannot grant or broaden
them** (#104 §5). *Why:* this is where architecture meets the Pipeline's
authority model — the declared effect surface is what dispatch briefings
project into task authority (#46), and what makes an unexpected effect a
typed violation instead of a surprise. *First increment:* **declaration**
(ownership rows in contracts/inventory) + **check** where mechanical
(protected effects resolve to declared owners — D3 class 5); semantic depth
explicitly `unsupported` where not mechanical, named as such.

### 2.6 Verification locality

Each module or bounded module set exposes deterministic verification
sufficient to test its contract and affected integration surface **without
an unrelated full-system model judgment** (#104 §6). *Why:* cheap targeted
verification is what lets a dispatched task prove its own result inside its
budget — and what selective Verify (C2) needs to be sound rather than
hopeful. *First increment:* **check** — declared verification entry points
exist per module; the candidate records the required affected-integration
checks (D3 class 6).

### 2.7 Session re-entry stability

A fresh session on any supported runner reconstructs the accepted
architecture, current contracts, relevant decisions, and sanctioned next
actions **from durable project artifacts** (#104 §7). *Why:* this is the
property the PO's question 3 names — it is what ends single-session
thinking. *First increment:* **check** — navigation/map currency for the
candidate (D3 class 7) plus the §3 estate below; parity criterion: two
fresh sessions on different runners resolve the same effective architecture
constraints and active exceptions (#99 AC, #104 §7).

### 2.8 Parallel work safety

Boundaries support independent work packages: explicit contracts, controlled
overlap, deterministic integration evidence, no implicit shared-write
authority (#104 §8). *First increment:* **check** — write-surface
intersection across concurrently dispatched packages (D3 class 8), fed by
each dispatch's declared primary module and planned write surface.

### 2.9 Refactorability without structural churn

Mechanical refactoring may be cheap for agents — accepted module identities,
contracts, and architecture decisions nevertheless remain stable until
evidence supports a deliberate change. The standard explicitly prevents
metric-driven module fragmentation, duplicated facades, and constant
topology churn; "agent-friendly" is distinguishable from "arbitrarily small
files" (#104 §9 + Problem). *Why:* the failure mode of an architecture
standard consumed by agents is over-compliance — optimizing the metric by
shredding the topology. *First increment:* **check** — accepted identities
change only through a D1 decision (identity diff against the inventory is a
profile-drift finding otherwise, D3 class 9); the "misleading tiny-module
optimization" fixture (#104 fixture list) pins the anti-gaming behavior.

### 2.10 Declared ↔ evaluated mapping

The nine declared properties (D2/#104) and the ten evaluated classes
(D3/#106 §Scope-3) interlock but are not 1:1 — this table is the missing
joint the gate found:

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

Every row's outcome is one of
`pass | finding | unavailable | unsupported | unknown | excepted` (§4); a
`signal` row can produce findings and calibration data but never `pass`.

---

## 3. Documentation for the machine — the knowledge estate and the re-entry contract

This answers the PO's question 3: how documentation works so agents *find
things again* instead of thinking in single sessions.

### 3.1 The estate — what a governed repository durably carries

| Artifact | Content | Contract |
|---|---|---|
| `AGENTS.md` | The universal entry point every major agent already reads natively (research §1: converged layer, AAIF-governed). Build/test commands, conventions, **and the pointer into the architecture map** | AGENTS.md-linkage is an explicit property of the shipped profile: the map is reachable from the entry point every foreign agent reads |
| Architecture map bundle (`architecture/map/`) | OKF v0.1: one concept file per module — markdown body for humans, YAML frontmatter for machines, normal markdown links forming the graph; an index/entry file | Pinned by OKF SPEC.md digest recorded in the effective profile; bundle conformance to the pinned revision is itself mechanically checked; representation swap is a governed #99 transition, never drift |
| Per-module concept file (frontmatter) | module id + boundary revision · responsibility / non-responsibilities · owned paths · public contract surface (inputs/outputs/invariants/errors/side effects) · allowed dependency directions · authority/effect ownership · verification entry points · accepted decision references · implementation-revision binding | The #104 §2 contract-sufficiency field list, verbatim — this is where those fields physically live |
| Module inventory (`pipeline.module-inventory.v1`) | The machine index of the above: identities, owned paths, contract surfaces, directions, effect ownership, verification entry points, ADR references, profile source, exact candidate/baseline binding; provisional identities marked until D1 acceptance | Never invented from directory names or one model's interpretation (#104, verbatim) |
| Compiled decision summary (`project/architecture-decisions.compiled.json`) | ids, one-line summaries, applicability, status, supersession links, active human exceptions — bounded in size, regenerated by the assessment script | #99 §5: fresh sessions receive the same effective decision set **without loading an unbounded document estate**; read at bootstrap |
| ADR estate (`docs/adr/` + `pipeline.architecture-decision.v1` sidecars) | The durable decisions themselves: status lifecycle `proposed → accepted → superseded / waived`, digest, scope, supersedes, exception fields | Superseded, never rewritten; no fabricated history (#99 §8) |
| Fitness model + baseline + adoption state | What is required, what debt is accepted, what has been decided | The ratchet's memory (#106 §4, #109 §1) |

### 3.2 The re-entry reading order — bounded by the task, not the repository

A fresh session (or dispatch briefing generator) reads, in order:

1. `AGENTS.md` — entry, conventions, map pointer;
2. the map index — the graph's root;
3. the concept files of **exactly the modules the task touches** (bounded by
   task surface, never by repository size);
4. the compiled decision summary, filtered by applicability;
5. lifecycle state / sanctioned next actions (existing bootstrap);
6. only then: the owned implementation surface.

The defining rule: sufficient context **without foreign implementation
reads**. When a task needed them anyway, that is not a session failure — it
is an architecture *finding* (`foreign implementation inspection required
beyond the accepted boundary`, #104 signal list), recorded in the receipt
and feeding the optimization loop (§5.3). Reading-budget targets are
calibration **outputs** of the C1/dogfood window, not numbers invented now
(#103's no-thresholds-from-a-short-baseline rule).

### 3.3 Why the estate stays true — freshness is enforced, not hoped

Documentation that can silently rot answers nothing. Navigation currency is
an evaluated property (D3 class 7) with teeth at the push boundary
(#106 §5, verbatim semantics):

- **candidate and publication pushes fail closed** on a stale architecture
  map or a stale touched contract;
- **session-checkpoint pushes are permitted** (an aborting session must be
  able to preserve work) but record typed
  `architecture-map-stale` / `contract-stale` debt bound to the exact pushed
  commit — a silent pass is impossible;
- open push-time staleness debt **must be consumed during the next
  applicable session's planning before implementation authority is
  granted** — a checkpoint exit cannot leave undetected stale state behind.

This is the mechanical answer to "wiederfinden": the artifacts agents
navigate by are the same artifacts the gates keep current.

### 3.4 Decisions that survive sessions (#99)

**Significance rubric — the five axes (deterministic, evidence-bound):** a
decision is architecturally significant when it materially affects
(1) system structure or component boundaries; (2) runtime, framework,
dependency, storage, or integration strategy; (3) deployment and execution
environment; (4) quality attributes (security, privacy, reliability,
portability, performance, …); (5) choices that are costly, risky, or hard
to reverse. No ADR for every implementation detail — the rubric returns
`initial-adr-required | architecture-baseline-sufficient |
no-material-architecture-decision`, naming which axis fired.

**The decision skill** (project-neutral, explicitly invokable): assess
significance; draft a concise ADR from governed evidence; identify
applicable inherited decisions; propose an explicit human waiver for a
needed deviation; supersede rather than rewrite; update the living summary
and references; validate status/identity/applicability/supersession/
traceability. It never approves its own decision or exception.

**Inheritance — follow by default, deviate only by auditable human
decision.** Applicable company/team decisions are agent-enforced,
human-waivable governed defaults; the agent may not silently ignore,
weaken, reinterpret, or override them. A waiver records decision, rationale,
scope, affected authority, and duration/supersession condition — and leaves
the original authority intact. Conflict semantics (the #99 §4 table,
condensed): governed default without exception → follow; explicit scoped
exception → follow the exception, preserve the reference; incompatible
inherited decisions → escalate to the owning human layer; project ADR vs.
higher authority → rejected without a valid scoped exception; advisory
deviation → allowed with named rationale where acknowledgement is required;
unavailable optional guidance → typed and unsatisfied, never falsely
consumed; unavailable **mandatory** source → blocks the dependent decision.
Directory location or a folder name never establishes authority. Org/team
sources arrive through #9's interface (id, digest, layer, applicability,
authority class, freshness) — referenced by identity, never copied wholesale;
public evidence sanitizes org coordinates.

**Every close reports one typed architecture impact:**
`architecture-conforms | architecture-decision-added |
architecture-decision-superseded | architecture-summary-updated |
no-architecture-impact` — recorded via the existing close-ritual extension
point; #97's change-request path consumes it so bounded implementation-phase
changes can supersede architecture without reopening design. Checkpoint
exits without a close are covered by §3.3's push-debt instead.

**The review side is semantic, not clerical [elementary requirement the
gate found missing]:** the Critic verifies *semantic conformance* to
applicable decisions and active exceptions — not merely the presence of ADR
files — and the fixture set includes a **token ADR that does not match the
implementation**, which must be caught (#99 §7 + AC). Changed material
architecture without a decision/supersession/exception fails closed before
final acceptance; recovery never fabricates historical decisions or infers
human approval.

---

## 4. The enforcement layer — how the practices are made real (#106, A1/A2)

The PO's question 2. Five mechanisms, together:

**(1) The enforcement invariant.** An architecture requirement is
enforceable only when it has: a stable property/rule id; closed input and
outcome schemas; applicability and coverage semantics; a deterministic check
or bounded adapter capability; explicit
`pass | finding | unavailable | unsupported | unknown | excepted` outcomes;
profile revision and digest; exact baseline/candidate binding; blocking or
advisory policy; and fixtures (#106, verbatim). Anything that cannot meet
this list is not "enforced" — it is at best a declared `prose` row with
named compensating detection (spec §2.3).

**(2) The deterministic-pass rule and the promotion pathway.**
`pass` comes only from a deterministic check or an explicit human acceptance
record. A model-judged evaluator may *propose* — its maximum outcome is
`finding` (candidate) requiring deterministic confirmation or human
acceptance (research §2: the agentic-fitness-function guardrails, adopted as
a named principle). Growth is designed, not accreted: a **recurring agentic
finding is promoted into a deterministic rule**, landing as a B2-ii suite
registration that must name the invariant it pins (`invariantPinned`, C2
consolidation rule). That pathway is how the catalog §2 gains checks over
time without rule sprawl.

**(3) One evaluator, five boundaries** — the same normalized semantics
everywhere (#106 §5):

| Boundary | What happens |
|---|---|
| Planning / pre-implementation | resolve effective profile; validate the machine-readable **architecture disposition**; evaluate planned modules/contracts/dependencies/effects/verification; surface `unsupported`/`unknown` before work begins; derive the #105 rigor contribution; **withhold implementation authority** while a required property has no accepted resolution |
| Dispatch / implementation | project the accepted module/write/authority surface into task authority (#46); block silent scope widening; material divergence ⇒ typed reauthorization; a prompt or revised plan sentence cannot change the effective profile. Delivered via briefing-generation + post-hoc candidate comparison (A2 layers) until A1 proves subagent-side interception on the runner in use |
| Pre-review / pre-close | evaluate the **actual** candidate graph, contracts, effects, verification, map, and measurements; compare planned vs. actual; new/worsened blocking findings must be resolved; result bound to the exact candidate |
| Push / session exit | §3.3 — candidate/publication fail closed on staleness; checkpoint pushes record typed debt consumed before the next implementation authority |
| CI / publication | same profile/baseline/analyzer/contract/candidate identities re-verified; unavailable, stale, invalid, incomplete ⇒ fail closed; model prose never substitutes |

**(4) Baseline-and-ratchet** (#106 §4): existing violations are inventoried
against an exact accepted baseline — visible debt, never `pass`; **net-new
or worsened** violations, new cycles, expanded forbidden reach,
missing/staler contracts, new ownership ambiguity, and expired exceptions
are blocked at configured boundaries; explicit improvement is permitted
while unrelated debt remains; resolved violations reduce the baseline
deterministically; only a human-approved transition alters the ratchet. New
projects/modules get no legacy shield: required properties are satisfied or
explicitly resolved through the PO custom-profile path **before
implementation authority**. Blocking behavior is promoted from report-only
per boundary, only with fixtures + dogfood calibration (Waves 3→4/5).

**(5) Enforcement honesty — the substructure.** Every claim above names the
layer that carries it (`enforcedBy`, spec §2.3), and those layers are
**measured, not presumed**: A1 probes per runner whether hooks fire for
dispatched work and whether payload indirection bypasses parameter
classification; A2 places each control on layers that provably execute for
the acting process (git hooks, tool scoping, post-hoc deterministic
verification; runner hooks only where measured). This is where the
"governance bycatch" belongs in the story: **A/B/C exist so that D's
promises are true.** A fitness gate that a dispatched agent never
encounters, a rigor floor an agent could talk down, or a receipt stream
that cannot tell `unknown` from zero would make the architecture standard
exactly the prompt-level decoration the research shows everywhere else
(research §3) — and that the PO's mandate rejects.

The rigor coupling closes the loop (#105): architecture evidence is a
deterministic *input* to the minimum rigor floor — missing/stale/unevaluable
profile evidence prevents low-rigor classification; new/worsened violations,
missing contracts, hidden effect ownership, late cross-module expansion
escalate or reauthorize; calibrated sustained context/re-entry/rework
friction triggers a required architecture review; and none of it can be
lowered by prompt, prose, route choice, or self-attestation.

---

## 5. User-facing representation (#109 §5, #104, #78 boundary)

The PO's question 4. The principle first (#109, verbatim intent): **the
machine-readable navigation map is the primary artifact; every human-facing
architecture view is derived from it — never the reverse.** Decision
authority remains human; artifact orientation is agent-first.

**5.1 The map doubles as human documentation.** OKF was selected precisely
because its bundles are "human-readable without tooling, agent-parseable
without SDKs" (research §1): markdown concept files with frontmatter are
directly browsable on the forge. `docs/ARCHITECTURE.md` — the living
architecture summary #99 already maintains — becomes a **derived rendering**
of the map (summary view + entry links), regenerated by the assessment
script, so the human view can never fork from the machine truth.

**5.2 The PO's decision surfaces**, each decision-ready rather than raw:

- **The architecture disposition** at the plan gate (greenfield/feature
  work): proposed modules, contracts, dependency directions, effect
  ownership, verification mapping — what the PO actually approves before
  implementation authority (#104).
- **The adoption proposal** (brownfield): inventory summary (candidate
  modules, coverage gaps, unknown-coverage share); a staged path — map
  first, hottest contracts next by observed traversal, the remainder under
  the ratchet; effort per stage with per-figure status
  (`measured | estimated | unavailable`); an explicit "what is NOT
  proposed: no restructuring, no all-at-once migration" (#109 §2).
- **Fitness and wave reports**: findings by class, baseline debt and its
  deterministic reduction, coverage classes (`evaluated / unsupported /
  unavailable / unknown / excepted`), staleness debt — the honest state of
  the architecture at every boundary.
- **Decision inspection and waivers**: ADRs with status/supersession, the
  compiled summary, and the waiver ceremony (signature-or-chat, shared with
  the B2 ceremony duality). How humans inspect and authorize is documented
  through the #78 documentation system (consumed, not rebuilt here).

**5.3 The active optimization loop** [elementary #104 requirement the gate
found entirely missing]: at planning — and again when actual evidence
diverges — the pipeline produces a **decision-ready comparison of plausible
remedies**: clarify or generate a contract; improve the navigation bundle;
change a dependency direction; split or merge a module; expose a stable
facade; localize verification or effect ownership; repair a Pipeline
dispatch/context contract; select or retain a custom architecture by
explicit PO decision; or gather more evidence. The recommendation is active
by default — the standard *proposes* compliant architecture during planning
instead of waiting for post-implementation review — while implementation or
architecture mutation still requires ordinary project authority and the
fitness contract. Measurements inform; they never authorize.

**5.4 No nagging.** Exactly one durable decision resolves an adoption
demand; a deferral carries a review condition or expiry; while a valid
decision stands, no per-session re-prompting; material change (new modules,
coverage regression, calibrated friction breach) re-raises with a **delta**
proposal, not a restart (#109 §3).

---

## 6. The two end-to-end paths

**Greenfield.** The active profile defaults to the shipped agent-first
standard (`inherited-agent-first` — never `unconfigured`, never
pass-by-absence). Planning produces the machine-readable architecture
disposition; unresolved required properties prevent the architecture-ready
claim; implementation runs under the projected surface (§4 dispatch row);
receipts accumulate; every close reports its typed architecture impact. The
PO may select a durable custom profile at any point — it is then enforced
and measured exactly like the standard, not repeatedly challenged, and not
silently replaced (#104/#106 §6).

**Brownfield.** Read-only inventory → typed adoption state
(`adoption-required | adoption-approved-scoped | adoption-deferred |
adoption-partial | adoption-complete`; a repository without an accepted
baseline deterministically resolves to `adoption-required`; absence of
evidence is never `adoption-complete`) → staged, priced proposal (5.2) →
**exactly one durable PO decision** → work proceeds under baseline-and-
ratchet; opportunistic improvement is welcome, restructuring is never
demanded. Backfill safety: generated maps/contracts carry coverage class and
confidence and cannot produce `pass` by themselves; present-state baseline
acceptance follows #99 — human-approved, forward-looking, no fabricated
history. The decision is cheap and mandatory; the migration is expensive and
deliberately released.

**Dogfood.** This repository is the first brownfield case, end to end:
inventory across the ~60-script/471-suite estate, priced proposal, recorded
PO decision — E2 qualification evidence (#109 §6).

---

## 7. Anti-goals — the standard's own guardrails (#104/#106/#109)

No universal folder layout, language, framework, module-size or module-count
rule. No recreation of human team boundaries as the default. No optimization
for token count alone. No automatic restructuring; no metric- or
analyzer-authorized refactoring — measurements can trigger a *review
requirement*, never authorize a change. No prompt/prose/self-attestation as
evidence. No permanent coupling to one knowledge format (the representation
contract keeps OKF swappable through a governed decision). No topology
churn: accepted identities move only through decisions (§2.9). No
prevention of the human owner acting outside the Pipeline.

---

## 8. Graduation

The normative core of §§2–6 graduates into the bound documents at the
rework step — the exact per-section integration map, including the PRD's
reframing (architecture as the headline, governance as the substructure),
lives in `gap-analysis-2026-08-28.md` §D. This document remains the argued
analysis and the traceability anchor back to the issue texts.
