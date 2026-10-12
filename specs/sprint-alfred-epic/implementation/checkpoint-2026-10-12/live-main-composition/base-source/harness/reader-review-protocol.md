# Reader-review protocol

Reader review evaluates comprehensibility, order, granularity and weighting.
It is separate from technical Critic review and implementation verification.

## Bounded 2+2 course

Freeze the checker's complete document set at each reviewed commit. Run two
fresh read-only readers: phase one receives only the frozen public documents;
phase two receives those documents, the immutable phase-one report, capability
inventory, governance input and this protocol. Preserve reports unchanged.

One course follows: complete review, correction batch, correction-focused
re-review, correction batch, complete review, correction batch,
correction-focused re-review, final correction batch. Every re-review receives
the full frozen document set and may flag surrounding regressions. Historical
complete reviews in re-review positions remain valid and consume the same
round; label their actual scope honestly. There are at most four two-stage
rounds and four correction batches. Count a batch once across multiple commits.
Preserve counts and findings across sessions. Renaming evidence, deleting a
report, or making an evidence-only commit does not reset the course.

An earlier round with no further public-document changes closes through the
ordinary v1 binding. After the fourth review, resolve findings in one terminal
batch and stop: no fifth Reader dispatch and no automatic new course for the
same findings. Every finding needs an exact resolution commit or explicit
documentation-owner acceptance. An unresolved finding leaves the course open.
Record existing owner policy or the actual course decision; this does not
create another PO approval gate. Distinct new documentation scope can require
a new course, but cannot erase unresolved findings from the existing course.

## Fixed committed inputs

The lexical, unique `READER_REVIEW_PATHS` in
`harness/scripts/check-doc-reader-binding.mjs` owns the sixteen public document
paths. Evidence, state, archives, ADRs and backlog content are excluded. Inputs
are `docs/product-capability-inventory.json`,
`governance/observation-doc-governance.json` and this protocol. Read raw Git
blobs only: covered files must be mode 100644, at most 512 KiB each and 4 MiB
combined; inputs are at most 1 MiB each. SHA-256 identity uses the actual NUL:

```
SHA-256("pipeline.doc-reader-docset.v1\0" + canonicalJson({
  coverage: [{ path, sha256 }, ...],
  capabilityInventorySha256, governanceSha256, readerProtocolSha256
}))
```

Snapshots discover committed inputs; they are not Reader evidence.

## Ordinary unchanged-state binding

`pipeline.doc-reader-binding-record.v1` remains valid. It has exactly `schema`,
`reviewedCommit`, `reviewedTree`, `docsetSha256`, `coverage`, `inputs`,
`phaseOne`, `phaseTwo`, `disposition`. The full reviewed commit is an ancestor
of the candidate, its tree is exact, and coverage/inputs/docset must equal both
committed states. Report and disposition references have exactly `path` and
`sha256`, under `specs/<feature-id>/evidence/reader-review/phase-one/`,
`phase-two/` and `disposition/`, with one matching safe round ID.

Reports are distinct, nonempty UTF-8 regular blobs, at most 1 MiB each.
Disposition is at most 256 KiB. Its closed schema is
`pipeline.doc-reader-disposition.v1`, with `schema`, `round`, `status`,
`findings`. `no-findings` requires an empty array; `resolved` a nonempty one.
Each finding has `id`, `class`, `status`, `resolutionCommit`. Unique safe IDs,
classes `cut`, `fileline`, `reordering`, and statuses `resolved`, `no-change`
are required. A resolved commit must be real and an ancestor of the reviewed
state; no-change requires null. Commit reports/disposition, then `record.json`
last. Covered document or input drift invalidates this binding.

## Terminal correction binding

The separate `pipeline.doc-reader-terminal-record.v1` record at the same
`record.json` path distinguishes the fourth reviewed state from the final
editorially corrected state. It does not claim that the final correction was
freshly read. Its field set is closed:

| Field | Contract |
| --- | --- |
| `schema`, `courseId` | Exact schema and safe course identifier. |
| `rounds` | Exactly four ordered entries, each `id`, `mode`, `reviewed`, `phaseOne`, `phaseTwo`, `disposition`. |
| `correctionBatches` | Exactly four entries, each `afterRound` (1..4) and 1..32 ordered unique correction `commits`. |
| `ownerDecision` | Exact `path`/`sha256` reference to committed `owner-decision.json`. |
| `final` | Exact snapshot of the final correction commit. |
| `policyTransition` | Null if protocol bytes match; otherwise exact `fromSha256`, `toSha256`, `commit`. |

Every `reviewed` and `final` snapshot has exactly `commit`, `tree`, `coverage`,
`inputs`, `docsetSha256`; recompute all bytes and identities. Modes are
`complete` for rounds one/three and `corrections-only` or honestly disclosed
historical `complete` for rounds two/four. Each batch follows its reviewed
commit and precedes the next reviewed state (or final state). Its commit list
must equal the Git history of covered document/input changes in that interval.
Evidence-only commits do not count as document correction commits.
Historical reviewed coverage comes from the literal `READER_REVIEW_PATHS`
array in that round's committed checker, parsed as data without executing old
code. It must be unique, lexical and within the current public scope. Bind that
actual coverage and its digest; do not invent earlier review of a document
added in a later correction. Final/candidate coverage still uses the current
fixed set. Missing or malformed historical scope declarations fail.

Every report reference has `path`, `sha256`, `publication`. Publication has
exactly `kind` (`raw` or `path-normalized`) and `rawSha256`. Raw publication
requires equality with the public digest. A normalized copy discloses the
private raw digest without publishing private bytes or pretending byte
identity. The checker binds the public copy's first committed publication,
and rejects subsequent rewrites or delete/re-add histories.

Each matching disposition uses `pipeline.doc-reader-terminal-disposition.v1`
and exactly `schema`, `round`, `status: resolved`, `findings` (1..256 entries).
Findings have `id`, `class`, `status`, `resolutionCommit`, as above. A `resolved`
finding names a commit in that round's correction batch. An `accepted` finding
requires null and its exact `<round>/<finding-id>` in the owner's acceptance
list. Open, unknown, duplicated or malformed findings fail. An empty earlier
round belongs to early ordinary closure rather than a manufactured four-round
terminal course.

The closed owner record uses
`pipeline.doc-reader-terminal-owner-decision.v1` with `schema`, `courseId`,
`authority: documentation-owner`, `by`,
`decision: authorize-terminal-correction`, `maxRounds: 4`,
`maxCorrectionBatches: 4`, `prohibitFifthReview: true`,
`fourthReviewedCommit`, `acceptedFindingIds`, `source`. Source is a digest-bound
reference to the adopted Reader skill, this protocol, or a safe Markdown
course-decision document directly under the feature's Reader evidence root.
It records existing authority; the JSON is not a signature or proof of human
identity. Acceptance keys must exactly match findings actually marked accepted.

Reject extra committed round evidence, including a fifth report subsequently
deleted from the candidate. Capability inventory and governance must match
the fourth reviewed inputs. A protocol change must be an explicit transition
in the final batch, bound to its actual committed bytes. Candidate coverage
and all inputs must match `final`; later drift fails. Publish reports,
dispositions and owner evidence, then commit the terminal record last.

The checker validates Git bytes, ancestry, bounds and declared dispositions.
It cannot prove reader identity/freshness, sandbox isolation, truthfulness,
semantic finding completeness, whether an edit resolves prose, or ownership
from a JSON claim. Retain honest host provenance and the immutable reports.
Do not substitute coordinator self-review or fabricate a final Reader verdict.

## Checker and release interface

```
node harness/scripts/check-doc-reader-binding.mjs \
  --root <root> --candidate <full40hex> --feature-id <safe-id> [--snapshot]
```

Unknown, duplicate and incomplete arguments fail. The check returns
`pipeline.doc-reader-binding-check.v1`, `passed`/`failed`, candidate and actual
reviewed identities, final docset digest, findings and
`committed-state-and-evidence-presence-only` assurance. Exit codes remain 0 for
pass, 1 for findings, 2 for usage/environment errors. `--snapshot` returns
`pipeline.doc-reader-docset-snapshot.v1`, never review success.

Source release preflight accepts only the exact committed checker result and
candidate-matching local checker/dependency bytes. It does not launch Reader
agents. Complete a valid ordinary or terminal binding before freezing the
release candidate; release gates remain separate.
