# Architecture review input — PO-provided Astra assessment (2026-09-09)

## Purpose and status

This is concise, non-normative input for later Alfred design and
implementation work. It records the PO-provided Astra assessment as review
material; it does not amend the approved PRD, specification, contract freeze,
or work-package order. The architecture doctrine and the specification remain
the governing design sources.

**Current status.** Alfred is in early implementation, not a completed
architecture platform. A1's offline CLI evidence establishes only an offline
evidence flow; it does not establish native-runner enforcement. C1 has
classification, aggregation, and source projection, but does not yet provide
end-to-end collection/reporting or a qualified baseline. Local observer,
controller and initial immutable-storage increments now exist; their presence
alone is not evidence of complete collection or production qualification. The D
architecture programs remain unimplemented, and E qualification is open.

## Intended module-contract and navigation model

The intended model is a bounded, machine-consumable knowledge estate, not an
assertion that it is already available:

- A module contract states accountable and non-accountable responsibilities;
  public inputs, outputs, errors, and invariants; permitted dependencies and
  effects; verification entry points; and applicable decisions.
- A concise `AGENTS.md` entry leads to an architecture map and then to the
  concept contracts for only the relevant modules. The navigation estate also
  includes a module inventory, ADRs, a compiled decision view, and the
  baseline/fitness material.
- Contract and inventory rows bind the relevant implementation and candidate
  evidence. They are not inferred merely from directory layout or a model's
  opinion.
- A boundary must make a real task easier to understand and verify. A better
  contract, a merger, or a shared interface test may be more useful than adding
  modules. Foreign implementation reads are a signal, not an automatic defect.

Repository-facing `docs/ARCHITECTURE.md` is intended as a readable projection
of the same map and concept prose, including responsibilities and decision
references. The Pipeline's user manual is a different deliverable: migration,
profile selection, decisions, exceptions and findings need worked workflows
and examples, with schemas and codes in an accompanying technical reference.
Neither should become a second manually maintained copy of module facts.

This reflects the estate and bounded re-entry order described in the
[architecture doctrine](agent-first-architecture.md) and
[specification §7](../spec.md). It is a target model, not evidence that
semantic contract correctness has been achieved.

## Intended adoption path

The proposed adoption shape is: read-only inventory → bounded proposal →
durable human decision → visible accepted baseline → prevention of new or
worsening violations → touch-time documentation. It keeps preservation of
existing project content ahead of wholesale restructuring and treats the
baseline as accepted, visible debt rather than a passing result.

The migration contract still needs explicit treatment of preview,
project-content preservation, idempotence, recovery, and partial adoption.
None is supplied or decided by this input. Plugin update and project adoption
are separate operations. Existing repositories must remain usable without
complete historical backfill. Accepted old violations do not permit new or
worsening ones; touch-time documentation records its actual capture date,
not an invented historical decision date.

## Mechanical-control distinctions

| Distinction | Review implication |
| --- | --- |
| Checkable structure vs. semantic correctness | Deterministic checks may establish declared structure; they do not by themselves prove a contract is semantically adequate. |
| Detection vs. prevention | A receipt, report, or post-hoc finding is evidence of detection, not proof that a prohibited action was prevented. |
| Fixtures vs. real observation | Fixtures prove a defined case; they do not replace runner observation, storage, reporting, or a qualified baseline. |
| Same-rule parity vs. same-model opinion | Runner parity requires the same effective deterministic rule inputs and evidence, not two similar model judgments. |

Any implementation work must retain active write ownership and coordinate
scope expansion. A task may not silently turn a proposed or observed boundary
into new write authority.

## Proposal topics — all explicitly **NOT decisions**

1. **Conformance versus human acceptance — NOT a decision.** Define the
   technical result separately from the human disposition. The assessment
   proposes keeping an accepted deviation visible as an exception, never
   converting an accepted risk into technical `pass`. This differs from the
   current specification §2.2, which also permits explicit human acceptance
   to produce `pass`; changing that rule requires reviewed planning, not this
   input note. Reconcile the same distinction with A1.
2. **Semantic schema binding beyond the family freeze — NOT a decision.**
   The family register binds names, IDs, revisions and consumers; it does not
   freeze concrete field definitions and their meaning. Before D1–D4, bind
   the normative schema artifacts and semantics as well as their producers
   and consumers. A family freeze is not a complete schema freeze.
3. **Hash limits — NOT a decision.** A fresh digest can accompany a false or
   incomplete contract. Bindings prove byte identity, not semantic truth;
   interface behavior tests and semantic review remain necessary. Define the
   binding direction so a versioned artifact never has to contain the hash
   of its own not-yet-created commit.
4. **14-day quality and coverage — NOT a decision.** Clarify which C1
   observations persist for the required window, and qualify sample volume,
   task mix, coverage gaps and producer/rule versions before deriving
   thresholds. Fourteen sparse days are insufficient evidence by themselves;
   retain the approved minimum. C1 interruption measurements do not replace
   D2 measurements of module interactions.
5. **Rule parity versus model views — NOT a decision.** Specify how common
   effective decisions and deterministic rules are resolved across runners.
   Models may produce different, defensible architecture proposals; that
   difference alone is not an automatic conformance failure.
6. **Foreign-read contextuality — NOT a decision.** Define when a foreign
   implementation read is expected contextual work, when it is an architecture
   finding, and what evidence distinguishes the two. Interpret counts with
   task type, correctness and rework: few reads may mean sufficient contracts
   or inadequate investigation. Do not reward avoiding necessary research.
7. **Runtime parallel coordination — NOT a decision.** Define active
   ownership, declared write surfaces, overlap handling, scope expansion, and
   integration evidence for concurrent work packages.
   Ownership must remain effective during execution, including generated
   files and shared state; a one-time disjoint-plan check is insufficient.
8. **Demonstrate useful end-to-end work — NOT a decision.** The next useful
   C1 proof is a real event → retained correlation → storage → honest report.
   Later demonstrate D on one module and a real change: a fresh agent finds
   the contract, uses it correctly, detects a real violation and leaves a
   usable handover. Control work must not permanently displace product work.
   C1 is not a substitute for that D proof; approved waves remain unchanged.

## Decision preparation

Before a later decision, prepare answers to these three questions:

1. For each overlapping Map, inventory, and fitness field, what is the
   leading source or derivation?
2. How can semantic schema binding be established without self-referential
   commit hashes?
3. What is the migration contract for preview, preservation, idempotence,
   recovery, and partial adoption?

For question 1, the doctrine's concept-file/inventory distinction is the
starting point, not yet a complete field contract. Prepare a field-level
matrix naming the sole authoring source, derived consumers, transformation,
and stale/conflict behavior. Resolve overlaps in owned paths, dependency
directions, effects, verification entry points and decision references before
implementing duplicate writable fields in Map, inventory and fitness model.
The matrix must also distinguish declared facts from measured evidence and
accepted debt. No source-ownership decision is silently established here.

### Proposed ownership mapping — decision input only

The following is a concrete proposal for review, not an accepted schema or
PRD amendment. It uses the doctrine's concept source and inventory index, an
ADR effective-decision projection, and fitness checks for executable
constraints rather than duplicate module declarations. Exact schema field
names remain unresolved.

| Fact/field group | ONE proposed authoring authority | Derived consumers | Drift/conflict behavior |
| --- | --- | --- | --- |
| Module purpose, responsibilities, boundaries, inputs/outputs, errors, invariants, permitted dependencies/effects, verification entry points | Module concept contract (the doctrine concept source) | Architecture map, repository `docs/ARCHITECTURE.md` projection, inventory index, ADR links | Report missing/stale projection or conflicting duplicate text; do not silently merge or choose a second writer |
| Module path, status, ownership pointer, contract location, implementation link | Module concept contract (the doctrine concept source) | Inventory index, map navigation, fitness lookup, review/readiness reports | Treat index/projection disagreement as stale derived data; refresh from the concept source or flag the source conflict for human resolution |
| Effective decision, applicability, exception/disposition, decision references | ADR register, projected to an effective-decision view | Concept-contract decision references, fitness checks, baseline accepted-debt view | Resolve by recorded applicability, supersession, and conflict semantics; ambiguous applicability remains an explicit conflict, never a simple newer-wins rule |
| Dependency and effect declarations | Module concept contract (the same single contract owner) | Inventory/index projections and fitness checks | A fitness failure reports a violation of the contract declaration; accepted debt stays visible and does not become a technical pass |
| Fitness check implementation, applicability, and coverage policy | Fitness-check suite/configuration, referencing contract declarations and effective decisions | Deterministic conformance checks and reports | Drift between a check and its referenced declaration is a stale-check finding; do not duplicate declarations in the fitness model |
| C1 interruption observations (collection, lineage, quality) | Qualified C1 interruption-observation producer/store | C1 reports and baseline inputs | Preserve lineage and unavailable data; do not substitute C1 interruption evidence for D2 interaction/correctness/rework evidence |
| D2 module-interaction, correctness, and rework measurements | Qualified D2 measurement producer/store (to be defined) | D2 proof and readiness reports | Keep producer/rule versions and gaps visible; no C1 result is treated as D2 evidence |
| Accepted baseline debt and exception evidence | Baseline snapshot record, referencing the human disposition | Baseline projection, reports, migration planning | Accepted old debt remains visible; new or worsening violations are not exempted and disagreement requires human resolution |

This mapping deliberately leaves the eventual serialized field names,
cardinality, and artifact schemas for reviewed design work. It also keeps
declared facts, measured evidence, and accepted debt as different kinds of
truth.

For question 2, a bounded proposal is to hash the reviewed, versioned schema
artifact from outside its future commit, record that digest in the consumer
binding or decision projection, and verify it against semantic/interface
tests. The artifact must not embed a digest of a commit that has not yet been
created. A digest mismatch is a binding failure; a matching digest is only
byte identity evidence and cannot waive semantic review.

### Bounded migration proof cases — future D4 input

These cases define evidence to request from a later implementation; they do
not claim that migration tooling exists or that any case has passed.

1. **Preview and preservation.** Run preview against a fixture repository
   containing unrelated user files, existing architecture documents, and one
   accepted historical violation. Verify a machine-readable change set,
   unchanged bytes for unrelated/user-owned content, and explicit reporting of
   the accepted violation. Apply the same change set only after review and
   compare the resulting tree with the preview.
2. **Repeat/idempotence.** Run the migration twice from the same source and
   compare the second preview/report and tree digest with the first applied
   result. The second run must propose no new changes and must not rewrite
   timestamps or reorder unrelated content.
3. **Resume/recovery.** Interrupt after a bounded named step, retain the
   correlation and partial report, then resume from the recorded checkpoint.
   Verify completed steps are not duplicated, remaining steps are explicit,
   and the final report distinguishes recovered work from newly performed
   work.
4. **Partial adoption.** Enable only one contract family/module in a fixture
   repository and leave the rest untouched. Verify navigation and fitness
   consumers scope themselves to adopted material, non-adopted content stays
   usable and visible as not-yet-adopted, and no historical backfill is
   implied. Repeat with a rejected preview to prove no writes occur.

## Non-claims

- No revised wave order is proposed or implied.
- No native-runner enforcement evidence is claimed.
- No baseline, acceptance, review, or qualification success is claimed.
- No new PO decision is made by this document.

## Source context

Captured from the PO-provided assessment on 2026-09-09 and corrected against
that supplied text on the same date. This is a structured extraction, not a
verbatim transcript or independently executed Critic review. The proposal
topics above remain decision input, not eight newly approved requirements.

- [PO gate-1 input](po-input-2026-08-28.md)
- [Agent-first architecture doctrine](agent-first-architecture.md)
- [Frozen contract families and consumer pinning](contract-freeze.json)
- [Track C, Track D, verification, and readiness predicates](../spec.md)
