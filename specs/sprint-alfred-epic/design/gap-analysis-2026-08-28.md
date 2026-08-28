# Gap analysis — PRD/spec vs. the architecture issues (2026-08-28)

Triggered by the PO's gate-1 rejection (`po-input-2026-08-28.md`): the design
is far too shallow on the primary mandate. Method: full re-read of
`../evidence/issues-snapshot-2026-08-27.md` (all nine bodies), then a
line-level audit of `../prd_sprint-alfred-epic.md` and `../spec.md` against
the elementary requirements of #99, #104, #106, #109.

**Snapshot-currency artifact** (the check behind "snapshot verified
current"; the snapshot itself carries no `updatedAt`, so the verification is
recorded here): `gh issue list --repo agent-pipe-shared/agent-pipeline
--label sprint:alfred --state open --json number,updatedAt`, run
2026-08-28, returned — #99 `2026-08-08T20:59:33Z` · #101
`2026-08-03T14:31:43Z` · #102 `2026-08-03T14:31:46Z` · #103
`2026-08-03T14:31:52Z` · #104 `2026-08-11T16:21:33Z` · #105
`2026-08-03T14:32:09Z` · #106 `2026-08-11T16:21:34Z` · #108
`2026-08-08T21:29:46Z` · #109 `2026-08-11T16:21:36Z`. Every value predates
the 2026-08-27 capture; the snapshot is current for this audit.
Label-only edits refresh `updatedAt` too, so this check is conservative in
the right direction: no body can have changed without it showing here.

Coverage classes used below: **absent** (nowhere in PRD or spec),
**name-only** (the concept is named, its content is not stated),
**mechanism-only** (schemas/plumbing present, the normative content by
reference), **covered**.

## A. The diagnosis, in one paragraph

The design compressed its normative core **by reference**: spec §7 says "the
nine #104 property classes", "the five #99 significance axes", "conflict
table per #99 §4" — and never states them. A reader of the PRD + spec alone
cannot learn what good agentic architecture *is*, what a module contract
must contain, what a fresh session reads to re-enter, or what the PO will
actually see. Simultaneously the emphasis is inverted relative to the
mandate: PRD §1 spends three of four problem paragraphs on the 2026-08-27
control-integrity incidents and reaches the architecture problem with
"Meanwhile…"; Track A gets five detailed WP paragraphs, Track D four
name-bullets. The PO's framing is adopted as the design directive:
**architecture is the catch; governance is the supporting substructure** —
A/B/C exist so that D's promises are mechanically true, and the documents
must say so in that order.

## B. Per-issue audit

### #104 — Agent-First Architecture Standard (the core of the mandate)

| Elementary requirement (issue text) | PRD | spec | Verdict |
|---|---|---|---|
| The nine property definitions with their measurement contracts (§1–§9: context locality, contract sufficiency, change locality, dependency legibility, authority/effect locality, verification locality, re-entry stability, parallel safety, refactorability w/o churn) | absent | name-only (§7.2 "the nine #104 property classes") | **missing** |
| Contract-sufficiency field list (responsibility/non-responsibilities, inputs/outputs/invariants/errors/side effects, dependency+authority boundaries, compatibility/lifecycle, verification entry points, revision binding) | absent | absent | **missing** |
| Context-locality metrics (modules/files consulted, contract vs. implementation reads, traversal, wall time, token dims, status) | absent | one receipt bullet | **missing** |
| Contract-sufficiency signals (11 signals incl. "foreign implementation inspection required") | absent | absent | **missing** |
| **Active architecture optimization** — decision-ready remedy comparison at planning; "actively proposes compliant architecture rather than waiting for review" (a top-3 outcome of the issue) | absent | absent | **missing entirely** |
| Property 9 anti-churn/anti-fragmentation (tiny-module trap; identities stable until deliberate change) | absent | absent | **missing** |
| Architecture disposition before implementation authority — what it *contains* | one clause (S5) | one clause (§7.3 planning row) | name-only |
| Navigation representation: OKF pin, AGENTS.md coexistence, bundle conformance mechanically checked | one clause | covered (§7.2) | thin in PRD |
| `inherited-agent-first`, never `unconfigured`; missing/stale profile non-green | absent | covered | thin in PRD |
| PO custom profile: decision fields, not-a-waiver, stays measured, agent cannot infer | one clause | one line | thin |
| Receipt fields (12-item list) with per-metric status | absent | compressed | thin |
| Fixture list (10 incl. tiny-module trap) | — | counted in acceptance §C, content by reference | reference-only |

### #99 — Architecture decision continuity

| Elementary requirement | PRD | spec | Verdict |
|---|---|---|---|
| The five significance axes | absent | name-only | **missing** |
| Follow-by-default / human-waiver semantics + the 7-case conflict handling + waiver record fields | absent | "per #99 §4 conflict table" | **missing content** |
| Inherited-source metadata interface (id, digest, layer, applicability, authority class, freshness; "a folder name never establishes authority") | absent | partial (§7.1 resolver bullet) | thin |
| Close-path architecture-impact enum (5 values) | absent | "typed enum per #99 §6" | name-only |
| The decision skill's seven capabilities (incl. never self-approving) | absent | "decision skill" | name-only |
| **Critic verifies *semantic* conformance; token-ADR-vs-implementation fixture** | absent | absent | **missing** — a review requirement, absent even from acceptance.md |
| Bounded session consumption (compiled summary, fields, budget) | absent | covered (§7.1) | thin in PRD |
| Typed baseline assessment (3 results), rubric determinism | absent | covered | thin in PRD |
| Existing-project adoption, no fabricated history | one clause | covered | ok |
| Two fresh runner sessions resolve the same effective set (parity AC) | absent | absent | **missing** |

### #106 — Fitness enforcement

The best-absorbed issue: the enforcement invariant, the ten classes
(compressed but named), the five lifecycle boundaries including checkpoint
staleness debt, baseline-and-ratchet, deterministic-pass, report-only →
blocking are in spec §7.3/§2.2. Real gaps: the **fitness-model content**
(the 11-item representation list of §Scope-2) is absent; PRD-level the whole
issue is one bullet; the declared(#104)↔evaluated(#106) mapping existed
nowhere (now doctrine §2.10).

### #109 — Adoption demand

States, staged priced proposal, single durable decision, re-raise
semantics, dogfood: covered compressed in spec §7.4. **Missing: §5
"agent-first artifact orientation"** — the machine-readable map is primary
and every human-facing view is *derived* from it. That principle is the
direct answer to the PO's question 4 and appeared nowhere in PRD or spec.

### PRD-level structural gaps (beyond any single issue)

1. §1 problem statement: architecture reached via "Meanwhile…" — inverted
   emphasis vs. the mandate (`po-input-2026-08-27.md`: "architecture work
   purpose-built for agentic software development … top result in
   greenfield AND brownfield").
2. §3 success measures: S5 is the only architecture-first measure. Missing
   measurable outcomes: re-entry from durable artifacts (receipt-measured
   foreign-read rate), decision-set parity across runners, map currency
   (no accepted candidate with stale navigation), disposition-before-
   authority as its own measure.
3. §4: Track D is four name-bullets against Track A's five worked
   paragraphs.
4. No PRD section answers the four PO questions as *requirements* (what the
   standard is; how enforced; how documented for machines; how shown to
   users).

## C. What was NOT missing (honest counterweight)

The mechanisms are real and stay: schema registry, E1 freeze, evaluator
placement, ratchet, OKF pin, receipts plumbing, the honest-telemetry
deviation, the A1-measured-enforcement foundation. The intake
(`issue-intake.md`) had absorbed several decisions correctly (OKF digest
pin; telemetry honesty; dispatch-layer placement note). The failure was that
PRD/spec never absorbed the *content* those dispositions point at — and the
review cycle (rounds 1–4) validated internal consistency of what the
documents said, while "are the issues' elementary requirements absorbed?"
was never an explicit review question. The rework round makes it one.

## D. Integration map — where each piece lands when the bound documents unfreeze

The doctrine (`agent-first-architecture.md`) carries the absorbed content;
these edits graduate it. Route: the verified
acknowledge → submit → reopen → edit → resubmit sequence recorded in
`docs/state.md` — with the acknowledge step deferred until the PO has seen
the reworked package.

**PRD:**
- Preamble — **normative-basis anchor** (PO directive at the re-review
  gate, 2026-08-28: the doctrine must be named in the PRD as mandatory
  basis, not merely cited): a dedicated **"Normative architecture basis"**
  line naming `design/agent-first-architecture.md` as the epic's binding
  doctrine — every track's work packages and their reviews conform to it;
  a deviation requires a recorded decision (register/ADR), never silent
  drift. The preamble's design-inputs list additionally gains the two rework
  documents it predates that are *inputs* rather than the basis itself
  (`design/gap-analysis-2026-08-28.md`, `design/po-input-2026-08-28.md`);
  `design/agent-first-architecture.md` is carried by the normative-basis
  line above instead of being demoted into that list. **Corrected after
  execution** (graduation Critic F5a): this bullet originally said "the three
  rework documents", and the graduation executed the stronger placement
  without recording the deviation. The map is corrected to the execution, not
  the reverse — the elevation is the better shape.
- §1 rewritten architecture-first: fresh sessions plan blind; structure
  silently human-shaped; knowledge lives in transcripts; prompt-level
  governance (research §3) — then the incidents as proof that even the
  *enforcement substrate* needs measurement (the substructure argument).
- §2 outcome: architecture bullet expanded to name the nine properties and
  the four-question answers at outcome level; order: D first, then A/B/C as
  substructure.
- §3: add S8 (re-entry: a fresh session reaches sufficient context from
  declared artifacts; foreign-read rate receipt-measured, targets
  calibrated post-C1), S9 (decision parity across two fresh runner
  sessions), S10 (map currency: no accepted candidate with stale
  navigation/touched contracts).
- §4 Track D: expanded from four bullets to the property catalog summary +
  estate/re-entry + enforcement + user-facing story (~1.5–2 pages), citing
  the doctrine. Tracks A/B/C are re-introduced as "what makes D true" —
  **executed in §1.2 and §2 rather than in §4** (graduation Critic F5b): the
  substructure argument belongs where the problem and the outcomes are
  stated, and §4 keeps its per-track structure unpolluted. Recorded here
  rather than moved.
- §7: add the semantic-conformance review criterion (#99 §7).
- §10 Traceability: a doctrine row mapping the PO's four questions to
  doctrine sections (best practices → §2, enforcement → §4, machine
  documentation/re-entry → §3, user-facing → §5).

**spec:**
- §7.1 (D1): enumerate the five axes; the close-impact enum values; the
  waiver record fields; the 7-case conflict semantics; the skill's seven
  capabilities; the parity requirement; the Critic semantic-conformance
  duty + token-ADR fixture; the brownfield decision-estate migration rule
  (doctrine §6, PO directive 2026-08-28: the mechanism installs with
  adoption, the accepted baseline is the estate's first record, inherited
  decisions are captured on touch via the significance rubric, honestly
  dated — never backdated, never a demanded mass backfill).
- §7.2 (D2): enumerate the nine properties with first-increment evidence
  class each (doctrine §2); the concept-file frontmatter field list —
  including compatibility/lifecycle expectations (all six #104 §2 fields);
  **the eleven contract-sufficiency signals as enumerated in doctrine §2.2**
  (absorbed text, not an issue pointer); the re-entry reading order; **add
  the missing deliverable: the remedy-comparison generator (active
  optimization)**; the derived-views principle (docs/ARCHITECTURE.md
  regenerated from the map).
- §7.3 (D3): add the declared↔evaluated mapping table (doctrine §2.10) and
  the eleven-item fitness-model representation list **as absorbed in
  doctrine §4(1)** (absorbed text, not an issue pointer).
- §7.4 (D4): add the agent-first artifact-orientation principle.
- §12: add #104's and #109's fixture lists to the named minimum inventory
  (they were the only two missing from the enumeration).
- §15: add rejected alternative "one merged property list for #104/#106"
  (rejected: declaration and evaluation stay distinct views joined by the
  mapping table).

**acceptance.md:** new rows — disposition-before-authority; map-currency
fail-closed + checkpoint-debt consumption; decision parity across runners;
semantic-conformance Critic fixture (token ADR); anti-fragmentation fixture
(tiny-module trap); active-optimization artifact exists at planning;
AGENTS.md-linkage property.

## E. Sequencing under the new emphasis

The wave order stands — A1/A2 measured enforcement before new authority
surfaces is precisely what makes D3's claims honest, and C1's 14-day window
stays the calendar-critical path (its receipts also calibrate D2's
thresholds). What changes is the **declared center of gravity**: D-track
substance is never on any droppable-tail list (PRD A-5 keeps naming only
C2's range-mode tail and B2-viii), wave summaries report D-progress first,
and the PRD's headline claim is the architecture outcome. If the PO wants
D-work pulled even earlier at the cost of running it on unmeasured
enforcement, that is a PO call the PRD §9 rework will offer explicitly —
the design's recommendation is the current order with the reweighted story.

**Closed 2026-08-28:** the offer was omitted from the first graduation,
restored by the graduation Critic round (F1) as PRD §9 decision 6, and
answered by the PO — the wave order stands, per the recommendation above.
