# A1 schema-revision blueprint (conditional)

Status: conditional planning only. This blueprint is executable only if the
PO chooses option 1 in `a1-po-decision-queue.md`; no PO decision is recorded
here and the current singular implementation remains authoritative until then.

## Proposed v1 revision shape

The exact top-level renames are:

- `probeSurface` → `probeSurfaces`
- `observation` → `observations`

Each `observations[]` item is a closed object with exactly:

`{probeSurface, hookObservation, evidenceKind, exitCode, markerSha256}`.

`probeSurface` is the correlation key and retains the approved literal surface
values. The other fields retain their current approved enums and hash/null
rules. `recordId` remains the canonical `${runner.name}:${layer}` identity.

## Closed invariants

- Emitted records have non-empty `probeSurfaces[]` and `observations[]`.
- `probeSurfaces[]` is a subsequence of the global approved
  `PROBE_SURFACES` order; surface IDs are canonical and unique within a
  record.
- `observations[]` is an exact 1:1 total mapping to `probeSurfaces[]`: no
  duplicate, missing, or extra surface; every observation correlates by its
  `probeSurface` key. Observations must appear in the identical correlated
  order; out-of-order input is rejected, never normalized.
- Raw outcomes remain separate per surface; no combined provenance string may
  overwrite or collapse observations.
- `evaluator` remains one record-level deterministic or human-accepted
  conclusion, not one evaluator result per surface.
- Candidate, staleness, sanitization, and provenance bindings are unchanged;
  all remain exact-key validated and candidate/version/privacy bound.

Plural fields apply generally because multiple execution contexts may probe
the same enforcement layer, not only `runner-hook`: for example, distinct
payload or Git invocation contexts can produce separate observations for one
layer. This does not assert a complete layer-by-surface cross-product; only
surfaces actually emitted for a record are represented.

## Files and freeze procedure

A later PO-authorized revision would touch exactly these tracked files:

- `specs/sprint-alfred-epic/spec.md`;
- `specs/sprint-alfred-epic/plans/a1-enforcement-conformance.md`;
- `specs/sprint-alfred-epic/design/contract-freeze.json`;
- `plugins/pipeline-core/scripts/enforcement-conformance.mjs`;
- `plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`.

Read-only inspection finds no current implemented consumer pin for this
schema beyond the frozen contract metadata and A1 implementation itself.
Therefore no consumer-pin file is changed in the atomic five-file revision;
future A2+ consumers must pin revision 2 and its recomputed digest when they
are implemented. The later evidence package records the migration and
candidate binding. TP-3
Verify registration, TP-4 `hooks.json`, the product capability inventory,
state, backlog, and other protected files remain out of this revision unless
a separate PO-authorized act explicitly covers them.

The freeze procedure is atomic: PO approval first; revise the schema/spec and
plan; bump the contract revision; recompute the contract digest using the
current `contract-freeze.json` `digestRule`; append the landed revision and
digest to `revisions[]`; then update every consumer pin in the same approved
sequence. Do not calculate or fabricate a digest before the exact approved
bytes exist. A revision is not consumable until its freeze readback confirms
the exact bytes, revision, and digest.

## Migration and test matrix

- Old singular records with `probeSurface`/`observation` are rejected; there
  is no compatibility alias unless the PO explicitly chooses one.
- Two runner-hook observations survive independently with distinct raw fields
  and deterministic correlation keys.
- Duplicate, missing, extra, and out-of-order surfaces are rejected; tests
  prove the global-subsequence order and digest stability.
- Record-level deterministic pass, human-acceptance pass/excepted, and all
  model/self-attestation restrictions remain enforced.
- Candidate commit/tree/artifact, runner/plugin staleness, exact keys/enums,
  and privacy sanitization retain the current refusal fixtures.
- Consumer fixtures prove every updated pin resolves the new revision and no
  consumer silently reads the old singular shape.

## Sequence and rollback

The PO-authorized schema/spec/freeze change and the core validator migration
land atomically and are read back before A1-2's probe matrix is implemented.
A1-2 then adds the live probe adapters and evidence producer against that
exact plural schema and digest; it does not leave the core singular and defer
its migration. With no current consumer pins, future A2+ implementations add
their revision-2/digest pins at their own approved boundary. Verify
registration remains a later protected maintenance act.

Rollback triggers include a digest mismatch, a consumer with an unupdated pin,
non-1:1 surface mapping, loss of raw outcomes, a failed evaluator/privacy or
candidate-binding fixture, or any protected-file drift. Before downstream
consumption, an unaccepted candidate may be abandoned or reverted. After a
revision has landed and been consumed, rollback is a new superseding
append-only revision/ledger entry through fresh PO approval; history is never
rewritten. Revalidate all consumer pins before resuming. Do not add a
compatibility alias or partial migration without a new explicit PO decision.

Copyable authorization template (not an accepted decision):

`PO authorization template: if option 1 is approved, land the atomic schema revision and freeze digest update described in a1-schema-revision-blueprint.md before A1-2; this line is not approval until the PO signs or chats it through the governing ceremony.`
