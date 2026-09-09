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
full observation, storage/reporting, or a qualified baseline. The D
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
None is supplied or decided by this input.

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
   boundary between deterministic conformance outcomes and the durable human
   acceptance records that can resolve an otherwise non-green disposition.
2. **Semantic schema binding beyond the family freeze — NOT a decision.**
   Explore bindings that connect schema meaning, producer, and consumer use;
   the existing family/revision/digest freeze is necessary but is not a proof
   of semantic interoperability.
3. **Hash limits — NOT a decision.** Establish what hashes bind, their
   cardinality/size limits, retention, and failure behavior without creating
   self-referential candidate-commit requirements.
4. **14-day quality and coverage — NOT a decision.** Clarify which C1
   observations must persist for the required window, what coverage and data
   quality make it qualified, and how unavailable data remains visible.
5. **Rule parity versus model views — NOT a decision.** Specify how common
   deterministic rule inputs and outcomes are compared across runners while
   retaining model-generated views as advisory findings.
6. **Foreign-read contextuality — NOT a decision.** Define when a foreign
   implementation read is expected contextual work, when it is an architecture
   finding, and what evidence distinguishes the two.
7. **Runtime parallel coordination — NOT a decision.** Define active
   ownership, declared write surfaces, overlap handling, scope expansion, and
   integration evidence for concurrent work packages.
8. **A full small C1 before a D proof — NOT a decision.** Consider whether a
   complete, deliberately small C1 path should be demonstrated before using
   it as the evidentiary basis for a D architecture proof; this does not
   reorder approved waves.

## Decision preparation

Before a later decision, prepare answers to these three questions:

1. For each overlapping Map, inventory, and fitness field, what is the
   leading source or derivation?
2. How can semantic schema binding be established without self-referential
   commit hashes?
3. What is the migration contract for preview, preservation, idempotence,
   recovery, and partial adoption?

## Non-claims

- No revised wave order is proposed or implied.
- No native-runner enforcement evidence is claimed.
- No baseline, acceptance, review, or qualification success is claimed.
- No new PO decision is made by this document.

## Source context

- [PO gate-1 input](po-input-2026-08-28.md)
- [Agent-first architecture doctrine](agent-first-architecture.md)
- [Frozen contract families and consumer pinning](contract-freeze.json)
- [Track C, Track D, verification, and readiness predicates](../spec.md)
