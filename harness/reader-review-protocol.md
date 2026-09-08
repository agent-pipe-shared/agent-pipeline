# Reader-review protocol

This protocol is for reader-facing documentation review. It is separate from
the technical Critic: it evaluates comprehensibility, order, granularity, and
weighting as a reader would, and it does not assess implementation correctness.

## Fresh two-stage review

1. Freeze the eleven documents named by `READER_REVIEW_PATHS` at a committed
   state `Y`. Before this stage, disclose neither the capability inventory,
   governance data, source, diff, nor history. A fresh reader reports only
   cuts, reorderings, and file/line findings; it does not provide replacement
   prose. Save its immutable report as `phase-one/<round>.md`.
2. Give a second fresh reader the same frozen eleven documents and immutable
   phase-one report together with the committed capability inventory,
   governance data, and this protocol. It records weighting, order,
   granularity, and comprehensibility in immutable `phase-two/<round>.md`.
   This is still reader review, never a technical Critic review.
3. Record every finding's closure in `disposition/<round>.json`. If either
   phase requires a public-document change, make the change and begin a new
   fresh two-stage round. A previous round cannot review a changed public
   state.
4. The first round requiring no further public-document work is the closure
   round. Commit its reports and disposition, then commit `record.json` last
   as candidate `C`. The record names the final reviewed state `Y`; `Y` must
   be an ancestor of `C`. Do not change covered documentation, the capability
   inventory, governance data, or this protocol between `Y` and `C`.

The checker only proves committed-state equality and the presence of bounded,
well-formed evidence. It does not prove reader identity, actual freshness,
sandbox isolation, truthful provenance, or judgment quality. A JSON boolean
does not prove an independent reader review.

## Bound document state

The fixed review set is exactly the lexical, unique `READER_REVIEW_PATHS`
constant in `harness/scripts/check-doc-reader-binding.mjs`. It contains eleven
approved public documents and excludes evidence, state, archives, ADRs, and
backlog content. A reviewed state hashes raw Git-blob bytes for every covered
file plus these raw committed inputs:

- `docs/product-capability-inventory.json`
- `governance/observation-doc-governance.json`
- this protocol

Every covered blob must be mode `100644`, at most 512 KiB; the set is at most
4 MiB. Inputs are at most 1 MiB each. The identity uses SHA-256 raw-byte
digests and `canonicalJson` with an actual NUL separator:

```
SHA-256("pipeline.doc-reader-docset.v1\0" + canonicalJson({
  coverage: [{ path, sha256 }, ...],
  capabilityInventorySha256,
  governanceSha256,
  readerProtocolSha256
}))
```

The checker reads Git objects only. Worktree edits and uncommitted reports
cannot satisfy it.

## Frozen evidence schema

For safe feature ID `<feature-id>` and safe round `<round>`, evidence paths
are fixed:

```
specs/<feature-id>/evidence/reader-review/
  phase-one/<round>.md
  phase-two/<round>.md
  disposition/<round>.json
  record.json
```

`record.json` has exactly these fields:

```json
{
  "schema": "pipeline.doc-reader-binding-record.v1",
  "reviewedCommit": "<full 40-hex Y>",
  "reviewedTree": "<full 40-hex tree of Y>",
  "docsetSha256": "<sha256>",
  "coverage": [{ "path": "<fixed path>", "sha256": "<sha256>" }],
  "inputs": {
    "capabilityInventorySha256": "<sha256>",
    "governanceSha256": "<sha256>",
    "readerProtocolSha256": "<sha256>"
  },
  "phaseOne": { "path": "<phase-one path>", "sha256": "<sha256>" },
  "phaseTwo": { "path": "<phase-two path>", "sha256": "<sha256>" },
  "disposition": { "path": "<disposition path>", "sha256": "<sha256>" }
}
```

The record must equal the recomputed coverage, inputs, and docset at both `Y`
and `C`. The reports are distinct, nonempty UTF-8 regular blobs at `C`, each
at most 1 MiB. The disposition is a regular UTF-8 JSON blob at `C`, at most
256 KiB, and has the same round identifier as both reports.

`disposition/<round>.json` is closed and has exactly `schema`, `round`,
`status`, and `findings`. Its schema is
`pipeline.doc-reader-disposition.v1`; `status` is either `no-findings` with an
empty array or `resolved` with a nonempty array. Each finding has exactly
`id`, `class`, `status`, and `resolutionCommit`. IDs are unique safe strings;
classes are `cut`, `fileline`, or `reordering`; statuses are `resolved` or
`no-change`. A resolved finding names a real full commit that is an ancestor
of `Y`; a no-change finding has `resolutionCommit: null`. Unknown, malformed,
or unresolved statuses fail. Empty findings are valid only through explicit
`no-findings` status.

## Checker interface

```
node harness/scripts/check-doc-reader-binding.mjs \
  --root <root> --candidate <full40hex> --feature-id <safe-id> [--snapshot]
```

Duplicate, unknown, and incomplete arguments fail before Git-object work.
The default emits one JSON object with schema
`pipeline.doc-reader-binding-check.v1`, a `passed` or `failed` status, the
candidate and reviewed identities (which may be null on unresolved failure),
the current docset digest (which may be null), findings, and assurance text.
It exits 0 only for pass, 1 for binding findings, and 2 for usage or
environment failures. `--snapshot` emits schema
`pipeline.doc-reader-docset-snapshot.v1`; it is read-only discovery and never
review evidence or a check success.
