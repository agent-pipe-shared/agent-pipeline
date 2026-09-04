# E1 implementation plan — shared contract freeze

## Purpose and boundary

E1 is the first Alfred implementation deliverable. It freezes the shared
contract and identifier families approved in [the technical specification](../spec.md)
and [the issue intake](../design/issue-intake.md) before later work packages
implement or consume them. The machine authority is
[`contract-freeze.json`](../design/contract-freeze.json), whose top-level
schema is `pipeline.alfred-contract-freeze.v1`.

This package does not implement any frozen schema, add a work package, change
the approved PRD/Spec/acceptance set, register a Verify suite, or grant an
agent new authority. Those remain later Alfred responsibilities. E1 fixes
identity, ownership, consumption, revision, and pinning semantics only.

## Representation

The artifact is a closed, versioned JSON document with these top-level
sections:

- `contracts[]` contains exactly the eleven rows of spec §3, in table order.
  Every row has exactly `family`, `schemaId`, `revision`, `digest`, `owner`,
  and `consumers`. `schemaId` is always an ordered array so the interruption
  and adoption pairs remain one owned family rather than two rows. The
  abbreviated source pairs are expanded to
  `pipeline.interruption-receipt.v1` + `pipeline.interruption-registry.v1`
  and `pipeline.adoption-state.v1` + `pipeline.adoption-proposal.v1`.
- `identifiers[]` contains exactly the six shared families in issue-intake
  order. Record field names, the profile-source values, the outcome values,
  and the decision-status values are frozen verbatim from the approved
  sources. Each entry names its WP consumers and its related contract rows.
- `consumerPinning` fixes the pin tuple as `{family, revision, digest}`.
- `revisions[]` is append-only. Sequence 1 records the landed initial freeze.
  Sequence 2 records the already-approved C2 registration change as
  `predeclared`, with null landed revision/digest; it therefore preserves the
  decision without claiming that C2 has shipped.

Ordering is semantic, not cosmetic. Contract and identifier arrays follow
their source order. Schema IDs preserve source left-to-right order. WP sets
follow `A1`–`A5`, `B1`–`B3`, `C1`–`C3`, `D1`–`D4`, `E1`–`E2`; contract
relationships follow `contracts[]`. Reordering any digest payload changes its
digest.

## Digest algorithm

There are two domain-separated payload types:

- contract row: `pipeline.alfred-contract-family.v1`, with `digest` omitted;
- identifier row: `pipeline.alfred-identifier-family.v1`, with
  `definitionDigest` omitted.

Canonical JSON recursively sorts object keys by Unicode code point, preserves
array order, uses normal RFC 8259 scalar encoding, and emits no insignificant
whitespace. The preimage is exactly:

```text
UTF-8(payload-schema + U+0000 + canonical-json(payload))
```

The stored value is the lowercase hexadecimal SHA-256 of that preimage. The
artifact is persisted as UTF-8, two-space-indented JSON with one trailing LF;
layout whitespace and that LF are not part of an item digest. Omitting each
item's own digest makes the construction non-self-referential. All other
fields and every array position are covered.

## Consumer pinning

Each listed consumer must persist the exact contract `family`, `revision`,
and `digest` against which it was built. A paired `schemaId` array is pinned
through its one owning family row, never through independent ad hoc pins. The
Verify-suite registration row expands “every WP” to all seventeen approved
WP IDs; C2 and D3 remain included as the direct consumers highlighted by spec
§3. E2 compares consumer pins for each family and refuses qualification when
they disagree.

## Later revision procedure

A contract change after E1 requires a PO-visible decision. Its owner must:

1. update the affected contract row without changing its `family` identity;
2. increment that row's `revision` and recompute its `digest` from the full
   canonical row payload;
3. append, never edit or remove, a `landed` entry in `revisions[]` naming the
   decision and the new revision/digest;
4. update or requalify every listed consumer pin; and
5. let E2 prove that all pins agree on the qualification candidate.

If any post-landing validation, E2 qualification, or consumer-pin
revalidation fails, the owning E1 maintainer (with PO authority for the
contract decision) rolls back by reverting the single E1 landing commit. The
trigger is a failed validation or disagreement that cannot be corrected as a
forward revision without changing the approved freeze. After the revert, the
maintainer reruns the focused validator, `check-doc-contracts.mjs`, and E2's
pin check against the pre-E1 candidate, then records the rollback decision
before attempting a new revision.

For C2 specifically, the existing sequence-2 predeclaration remains
unchanged. When C2 adds required registration fields `invariantPinned` and
`nonOverlapNote`, it bumps the Verify-suite registration row and appends a
new landed ledger entry. Until that happens, its `landedRevision` and
`landedDigest` remain null and revision 1 remains the current contract.

## Validation commands

E1 is validated with these commands from the repository root:

```text
node scratch/alf-e1-contract-freeze-validator.mjs
node harness/scripts/check-doc-contracts.mjs
git diff --check
git diff -- specs/sprint-alfred-epic/design/contract-freeze.json specs/sprint-alfred-epic/plans/e1-contract-freeze.md
```

The temporary validator parses the JSON and checks the literal top-level
schema; exact contract and identifier memberships; row keys; family, schema,
and digest uniqueness; all declared orderings; consumer/relationship
references; canonical digest recomputation; the initial-freeze ledger; and
the pending C2 revision invariants. It is temporary dispatch machinery under
`scratch/`, not a third E1 deliverable.

## E1 acceptance evidence

The dispatch record at
`evidence/dispatch-record-ALF-E1-FREEZE.json` records the exact commands,
exit codes, and committed candidate SHA. The acceptance conditions are:

- the focused invariant validator exits 0 with all stored digests matching;
- the doc-contract check loses the prior untracked `plans/` target finding,
  leaves only the nine immutable issue-snapshot false positives, and adds no
  finding;
- `git diff --check` exits 0;
- the scoped diff contains only this plan and the freeze artifact; and
- one atomic commit carries the required dispatch and AI-assistance trailers.

Independent Critic review remains required by [AC-14](../acceptance.md) and is
performed after this implementation dispatch; PO acceptance remains open
until that review and the ordinary wave decision complete.
