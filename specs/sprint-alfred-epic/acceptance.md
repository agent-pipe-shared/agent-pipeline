# Sprint Alfred Epic — Acceptance criteria

Binding acceptance map: PRD §7 requirement → concrete evidence that
satisfies it. Every row names the artifact/suite that proves it; "evidence"
always means candidate-bound per Nova-spec §2.2 conventions. Member-issue
acceptance lists (#99, #101–#106, #109) apply at each issue's closure —
satisfied, or with deviations explicitly PO-accepted at that closure (PRD §7
criterion 2; the intake's argued deviations are the starting set). This file
adds the epic-level and incident-derived criteria and the fixture inventory
floor. Criterion ids are `AC-*` (epic) and `IR-*` (incident-derived) —
deliberately disjoint from the WP ids (`A1`–`A5`, `B1`–`B3`, `C1`–`C3`,
`D1`–`D4`, `E1`/`E2`), which the Evidence column references freely.

## A. Epic-level criteria

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | Enforcement-conformance records exist for every supported runner used in the sprint, are green in Verify, and every shipped control's placement row is consistent with them | `pipeline.enforcement-conformance.v1` records; `control-placement` Verify check |
| AC-2 | No agent route mutates: a protected-baseline surface, approved PRD/Spec bytes during implementation, or closed-evidence bytes — per supported mutation route fixtures; residual gaps are typed rows, not silence | A3/A4/A5 fixture suites; A2 table `residualGaps[]` |
| AC-3 | Every sanctioned `pipeline-state.mjs` verb yields a state accepted by every readiness observer | `pipeline-state-observer-conformance.test.mjs` green |
| AC-4 | `submit-plan`/`approve-plan` refuse pre-authority staging paths with the typed reason | A4 entry-guard fixtures |
| AC-5 | Closed-evidence drift: detected as a diagnostic on active branches, fail-closed on inactive ones, and repairable via the two PO-gated verbs with audit trail | A5(i) fixtures incl. a replay of the 2026-08-27 incident shape |
| AC-6 | ≥14 days of interruption receipts exist before any threshold-dependent promotion; the window is machine-checked, not remembered | `interruption-baseline.json` + the promotion checks that read it |
| AC-7 | Rigor floor: same normalized inputs ⇒ same floor (pinned fixtures); unknown inputs never lower; actual-surface growth escalates/reauthorizes; report-only disagreement log exists before enforcement | B1 fixtures + disagreement log artifact |
| AC-8 | Greenfield resolves to `inherited-agent-first` and produces a machine-readable disposition before implementation authority; a PO custom profile is honored, measured, and never silently replaced | D2/D3 planning fixtures |
| AC-9 | This repository completes the D4 adoption flow end to end: typed state, priced staged proposal, one durable PO decision, evidence recorded | dogfood evidence set under `specs/sprint-alfred-epic/evidence/` |
| AC-10 | Model-judged evaluator output can never be `pass` (deterministic-pass rule) — attempted prompt-only compliance yields `finding`/`unknown` in fixtures | D3 fixture "prompt-only claimed compliance" |
| AC-11 | The eight B2 routes exist; each refusal message names its route; the B2-i authorization satisfies its four ⚖ constraints | B2 per-route fixtures |
| AC-12 | Rules-as-code sweep landed: GG-22 defined where cited; SendMessage relay rule homed; push-flow doc corrected; strip tool bounded to the Triage section | B3 doc-consistency suites + strip fixture |
| AC-13 | Every open `sprint: alfred` backlog item is closed with closure evidence or PO-visibly re-triaged; ledger reconciled; member issues closed with candidate-bound comments; sprint close comment written. The set is **28 as of 2026-08-28**: the 24 read in full by the design intake, minus the two moved to Nightwing at the design gate (PRD §9 decision 1), plus the six this design phase itself filed. The live set, not this number, is authoritative at close — re-count with `check-backlog-sprint-assignment.mjs` | backlog ledger + GitHub issue trail |
| AC-14 | Every wave's deliverables passed ≥1 independent Critic round (fresh context, paths-only dispatch); fail-then-fix cycles documented — and the same bar held for every design document of this epic before PO review (spec §12 design-phase review duty) | Critic evidence under `evidence/critic/` |
| AC-15 | Documentation acceptance per member issue against the exact accepted candidate | per-issue doc evidence links |
| AC-16 | Every host-layout onboarding test this sprint adds or touches asserts the success contract of §D; a rejection-only test appears solely for an explicitly unsupported layout. The affected-artifact set is **re-derived after the Nova rebase** (PO constraint, 2026-08-28) rather than carried from this clone base | §D review lens; A-track Critic evidence; the wave-0 post-rebase re-derivation note |
| AC-17 | **Disposition before authority:** no work package reaches implementation authority in a governed area whose architecture disposition is unresolved; an `adoption-deferred` decision satisfies this, an absent one does not | D4 adoption-state fixtures; planning-boundary evaluator run |
| AC-18 | **Map currency fails closed:** an accepted candidate never leaves its navigation map stale against contracts it touched; a checkpoint push instead records typed staleness debt, and the next planning boundary consumes that debt rather than discarding it | D3 class-7 fixtures (fresh/stale map); push-boundary debt fixture |
| AC-19 | **Decision parity across runners:** two fresh sessions on different supported runners resolve the same effective architecture constraints and active exceptions for the same governed area, or emit a typed divergence finding | D1 parity fixture (two-runner replay) |
| AC-20 | **Semantic conformance, not file presence:** the Critic review catches a token ADR that does not match its implementation | D1 token-ADR fixture (#99 §7) |
| AC-21 | **Anti-fragmentation:** a change that improves a metric by shredding topology into tiny modules is rejected rather than rewarded | #104 "misleading tiny-module optimization" fixture |
| AC-22 | **Active optimization exists at planning:** a finding at the planning boundary carries proposed conformant remedy options with their comparison, not only the violation | D2 remedy-comparison generator fixture |
| AC-23 | **AGENTS.md linkage:** a governed repository's AGENTS.md references the map bundle entry point, and the declared re-entry reading order resolves end to end from it | D2 estate fixture; re-entry walkthrough evidence |

## B. Incident-derived regression criteria (live-measured classes)

| # | Criterion | Evidence |
|---|---|---|
| IR-1 | A post-close write to a bound Result is refused (agent routes) and detected (any route) at next state read — not at the next lifecycle transition weeks later | A3 dynamic-class + A5(i) fixtures |
| IR-2 | A `discard-feature` on a repo with active continuity and null Result completes into a `ready` session with no human shell step | A5(ii) end-to-end fixture |
| IR-3 | The four seed interruption classes (per-class dates and provenance: `design/issue-intake.md` #103) emit correct receipts when reproduced | C1 seed fixtures |
| IR-4 | A guard-refused read-only interpreter command receives a typed read-only retry action, not a signature demand | B2-iii fixture |

## C. Fixture inventory floor

The union of: #101's 8 named fixture classes; #102's 8; #103's classification
determinism + lineage + privacy set; #104's 10; #105's 14; #106's 21; #109's
7 + dogfood; A1's probe classification set; A5's observer-conformance
enumeration; B2's per-route sets; C1's four seeds. `verify-suite-registration`
entries for each carry `invariantPinned` (C2 consolidation rule) — a fixture
that cannot name its invariant does not register.

## D. Review-lens rule (PO-accepted 2026-08-28 — PRD §9 decision 2)

`managed-onboarding-success-contract` is accepted into Alfred as a rule, not
as a work package: every host-layout onboarding test added or touched by this
sprint asserts the end-to-end success contract (inspect/plan/apply/readback,
exact allowed write set, host-control preservation); rejection-only tests are
acceptable solely for explicitly unsupported layouts. Applied as a Critic
review lens on A-track diffs touching onboarding tests, and bound as AC-16.

Two properties of this rule are deliberate and must survive later editing:

- **The target set is provisional until the Nova rebase.** The PO's
  acceptance carries the constraint that the onboarding surface changed in
  the Nova line, so the item's own affected-artifact list
  (`project-onboarding-v3.test.mjs`, `project-onboarding-e2e.test.mjs`, the
  onboarding acceptance guidance) is re-derived in wave 0 against the
  post-rebase base. A rule applied to a file list inherited from this clone
  base would silently miss whatever Nova moved.
- **The item's own `sprint:` field stays undeclared, by mechanism, not by
  oversight.** Ledger event 41's rescoped byte-pin binds that item's
  pre-Triage bytes; adding `sprint: alfred` there fails the backlog gate
  (`item-hash-rescope-amendment itemSha256 does not bind the current item's
  pre-Triage bytes`), measured live on 2026-08-28. The item therefore stays
  `status: deferred` and outside AC-13's closure set; this section is where
  its Alfred membership is recorded.
