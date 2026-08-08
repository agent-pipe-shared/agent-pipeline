---
schema: pipeline.backlog-item.v1
id: pipeline.immutable-manifest-entries-can-be-rebound-with-no-amendment-record
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-09-07
source: "Critic finding F5, Phoenix gate-integrity full review round 1, 2026-08-08: lifecycle.json rebound the sha256 of an entry declared mutability immutable, and the schema has no field that could have carried the reason."
---

# An `immutable` manifest entry can be rebound to different bytes with no amendment record

## Description

`pipeline.feature-package.v1` entries carry a `mutability` field with values
including `immutable`, but the schema has no field for recording *why* a digest
changed. So when an `immutable` entry is legitimately rebound — the artifact was
renamed, or moved under a different authority — the manifest records the new
digest and nothing else. The declaration and the history disagree, and the
manifest cannot say so.

The mechanical consequence: rebinding is indistinguishable from an
undocumented byte change. The only signal that an immutable artifact moved is
the digest itself, and rebinding is exactly the operation that erases it.

## Triggering situation

`ece6041` rebound `specs/sprint-phoenix-epic/lifecycle.json`'s `prd` entry from
`303586c8…` to `8b820ea5…` while that entry declares `"mutability":
"immutable"`. The rebind was correct and its cause is recorded in the handover
(`docs/state.md`, the `ece6041` paragraph): `d377272` renamed the PRD and bound
it under the epic, and the manifest never followed. But the record lives in
prose in a different file, so a reviewer reading the manifest and the artifacts —
which is what a Critic does — sees a silent change. That is how it surfaced
(Critic F5, minor).

The contrast that makes the gap visible: the `acceptance` entry was rebound in
the same commit, and *that* one is legible, because `acceptance.md:187` carries
its own dated "Amendment for GMW (PO, 2026-08-08)" block in the artifact's body.
An artifact whose format has nowhere to put such a block — or one that must stay
byte-stable — has no equivalent.

## Affected artifact

- `plugins/pipeline-core/scripts/pipeline-manifest.schema.json` and the
  `pipeline.feature-package.v1` shape — where an amendment field would live.
- `specs/sprint-phoenix-epic/lifecycle.json:9-16` — the instance that surfaced it.
- Whatever validates feature packages (`artifact-topology-check`) — the natural
  place to require the field when an `immutable` entry's digest differs from the
  previously recorded one.

## Proposal

Give the manifest somewhere to record the amendment, and make it mandatory
exactly when it is load-bearing. Sketch, not a settled design:

- An optional `amendment` object on an artifact entry — `{ at, reason,
  previousSha256 }` — required only when an entry declared `immutable` is
  written with a digest different from the one already recorded.
- The check then has a real invariant to enforce: an immutable entry may change
  its digest only in the same write that supplies the amendment record, and
  `previousSha256` must equal what was there before.

The design question not to settle inside this item: whether `immutable` should
instead mean *the digest may never change*, with a rename modelled as retiring
one entry and adding another. That is the stricter reading and it may be the
right one; it changes how renames are recorded across every feature package, so
it is not a call to make while closing a minor finding.

Acceptance test: rebinding an `immutable` entry without an amendment record makes
the feature-package check exit non-zero, demonstrated by a deliberate fixture
rather than asserted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
