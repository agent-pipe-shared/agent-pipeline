# Reader-review protocol

Reader review evaluates comprehensibility, order, granularity and weighting.
It is separate from technical Critic review and implementation verification.

## Bounded 2+1 course

Freeze the checker's complete document set at each reviewed commit. Run two
fresh read-only readers: phase one receives only the frozen public documents;
phase two receives those documents, the immutable phase-one report, capability
inventory, governance input and this protocol. Preserve reports unchanged.
One paired round means both stages, not two independent round credits.

New courses have two regular paired rounds: a complete review and correction
batch, then a fresh re-review and second correction batch. Round two may be
corrections-only or honestly disclosed complete. Every round receives the full
frozen document set and may flag surrounding regressions. One optional third
paired round must be complete and requires a committed, digest-bound
justification after round two and before either third-round reader launches.
Apply a final correction batch after that round. There are at most three
paired rounds and three correction batches. No new course may launch a fourth.

Count a batch once across multiple commits. Preserve the same course ID,
reviewed snapshots, report pairs, counts, batches and remaining findings across
edits, commits, restarts and evidence renaming. Deleting a report or making an
evidence-only commit does not reset the course. A clean round with no further
public-document edits closes through the ordinary v1 binding; this includes a
single clean round. At terminal correction, every finding needs an exact
resolution commit or explicit documentation-owner acceptance. An unresolved
finding leaves the course open and cannot yield a passing source binding.
Distinct new documentation scope may require a new course, but cannot erase
outstanding previous findings. Do not silently start another course for the
same findings. Record existing authority; this is no new PO approval gate.

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

## Terminal correction binding for new courses

`pipeline.doc-reader-terminal-record.v2` at the same `record.json` path
distinguishes the last reviewed state from the final editorially corrected
state. It does not claim that the final correction was freshly read. Its exact
closed field set is `schema`, `courseId`, `rounds`, `correctionBatches`,
`ownerDecision`, `final`, `policyTransition`, `escalation`.

| Field | Contract |
| --- | --- |
| `schema`, `courseId` | Exact v2 schema and safe course identifier. |
| `rounds` | Two or three ordered entries, each `id`, `mode`, `reviewed`, `phaseOne`, `phaseTwo`, `disposition`. |
| `correctionBatches` | Same length as `rounds`; each `afterRound` (1..2 or 1..3) and 1..32 ordered unique correction `commits`. |
| `ownerDecision` | Exact `path`/`sha256` reference to committed `owner-decision.json`. |
| `final` | Exact snapshot of the final correction commit. |
| `policyTransition` | Null if protocol bytes match; otherwise exact `fromSha256`, `toSha256`, `commit`. |
| `escalation` | Null for two rounds; for three, exactly `afterRound: 2`, `reason`, `source`. |

The escalation reason must be nonblank and at most 500 characters. Its source
has exactly `path` and `sha256`, referencing committed justification introduced
after round two and before the third reviewed state. Commit that justification
before launching either reader for the third round. Reject missing, late,
malformed or mismatched justification; a two-round record cannot carry an
escalation. The closure checker binds publication timing and bytes, not actual
launch timing or the truthfulness of the reason.

Every `reviewed` and `final` snapshot has exactly `commit`, `tree`, `coverage`,
`inputs`, `docsetSha256`; recompute all bytes and identities. Modes are
`complete` for round one and optional round three; round two is
`corrections-only` or honestly disclosed `complete`. Each batch follows its
reviewed commit and precedes the next reviewed state (or final state). Its
commit list must equal the Git history of covered document/input changes in
that interval. Evidence-only commits do not count as document correction
commits. Historical reviewed coverage comes from the literal
`READER_REVIEW_PATHS` array in that round's committed checker, parsed as data
without executing old code. It must be unique, lexical and within the current
public scope. Bind that actual coverage and its digest; do not invent earlier
review of a document added in a later correction. Final/candidate coverage
still uses the current fixed set. Missing or malformed historical scope
declarations fail.

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
round belongs to early ordinary closure rather than a manufactured terminal
course. No `openFindings` key belongs in terminal v2.

A finding may instead be `adjudicated` in terminal v1 and v2: the round's own
phase-two Reader expressly declined the phase-one finding and the course
changed nothing for it. It has `resolutionCommit: null` and exactly one extra
field, `adjudication`, with `report` (exactly `path` and `sha256`, equal to
that round's `phaseTwo` reference), `phaseOneQuote` and `phaseTwoQuote`. Each
quote is one trimmed line of 16..300 characters occurring literally in the
matching immutable report; the two differ and a phase-one quote is used once
per disposition. The status is neither a correction nor an owner acceptance and
never appears in the owner's acceptance list. The checker proves only the
binding, not that the Reader's reasoning is right. Use it only for a decline the
phase-two report states: a finding that report leaves open, carries forward or
only partly addresses stays unresolved and keeps the course open. Never infer
an adjudication, an acceptance or a resolution commit that was not recorded.

The closed owner record uses
`pipeline.doc-reader-terminal-owner-decision.v2` with exactly `schema`,
`courseId`, `authority: documentation-owner`, `by`,
`decision: authorize-terminal-correction`, `maxRounds: 3`,
`maxCorrectionBatches: 3`, `prohibitFourthReview: true`,
`lastReviewedCommit`, `acceptedFindingIds`, `source`. `lastReviewedCommit`
equals the last round's reviewed commit. Source is a digest-bound reference to
the adopted Reader skill, this protocol, or a safe Markdown course-decision
document directly under the feature's Reader evidence root. It records existing
authority; the JSON is not a signature or proof of human identity. Acceptance
keys must exactly match findings actually marked accepted.

Reject extra committed round evidence, including a fourth report subsequently
deleted from the candidate. Capability inventory and governance must match
the last reviewed inputs. A protocol change must be an explicit transition in
the final batch, bound to its actual committed bytes. Candidate coverage and
all inputs must match `final`; later drift fails. Publish reports, dispositions
and owner evidence, then commit the terminal record last.

## Historical v1 compatibility

Historically completed ordinary v1 and terminal v1 bindings remain valid under
their unchanged validation contracts. Preserve exact historical evidence
bytes, schemas, counters, reports and decisions; do not migrate them to v2.
Historical terminal v1 uses `pipeline.doc-reader-terminal-record.v1`, exactly
four rounds and four batches, and its existing closed fields without
`escalation`. Its modes remain complete in rounds one/three, and
corrections-only or honestly disclosed complete in rounds two/four. Its owner
schema remains `pipeline.doc-reader-terminal-owner-decision.v1`, with
`maxRounds: 4`, `maxCorrectionBatches: 4`, `prohibitFifthReview: true`, and
`fourthReviewedCommit`; other owner fields and values remain identical. Its
unchanged checks retain fourth-reviewed inventory/governance equality, no fifth
evidence, publication immutability, exhaustive correction commits, final
equality and explicit protocol transition.

An incomplete historical four-round record can be completed only under its
already-established historical decision and unchanged v1 requirements. Derive
the adoption boundary from committed policy/course evidence, never a
caller-supplied legacy boolean. Neither this compatibility rule nor a schema
conversion grants permission to launch a new fourth round or repairs existing
drift, provenance or finding gaps.

The checker validates Git bytes, ancestry, bounds and declared dispositions.
It cannot prove reader identity/freshness, sandbox isolation, truthfulness,
semantic finding completeness, whether an edit resolves prose, or ownership
from a JSON claim. Retain honest host provenance and the immutable reports.
Do not substitute coordinator self-review or fabricate a final Reader verdict.
Closure validation does not provide a shipped prelaunch course controller.

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
