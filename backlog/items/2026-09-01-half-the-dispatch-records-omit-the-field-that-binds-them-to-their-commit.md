---
schema: pipeline.backlog-item.v1
id: pipeline.half-the-dispatch-records-omit-the-field-that-binds-them-to-their-commit
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Critic round I, finding F-2, 2026-09-01, reviewing commit 7bca7f5d. Measured against evidence/dispatch-record-NVA-B-HANDOVERPATH-FIX.json and then against the whole evidence corpus."
---

# Roughly half the dispatch records omit `report.changedFiles`, so their commits' authorship cannot be established mechanically

## What was measured

`templates/prompts/agent-obligations.md` §6 — a GENERATED file, derived from the
enforcing component rather than hand-written — states three conditions that a
`Dispatch: <TASK_ID> (goldfish)` commit trailer entails:

> `evidence/dispatch-record-<TASK_ID>.json` must exist, its `outcome` must be
> terminal rather than `in-progress`, and its `report.changedFiles` must cover
> the paths the commit touches.

For the commit under review, two of the three held. The record existed, its
`outcome` was `implemented-committed`. The key `changedFiles` did not appear in
the file at all. The changed paths were present only as free prose inside the
report text.

The reviewer then widened the measurement rather than filing against one
dispatch: roughly **60 of about 130 records** in `evidence/` carry the field, and
a substantial share of the same session block's own records also lack it. The
corpus is mixed, not uniformly compliant with a rule one record happened to miss.

## Why this matters more than a missing field usually would

The `Dispatch:` trailer and the dispatch record are described in
`goldfish-task.md` field 6 as "the deterministic authorship/evidence pair for
close step 6b and the Critic". The word doing the work there is *deterministic*.
A record whose changed-path list exists only as prose can be read by a person and
cannot be resolved by a checker — so for half the corpus, the authorship chain the
pair exists to establish is human-establishable only.

That is precisely the property the pair was introduced to replace. `AI-Assisted:
true` is already the anonymous assistance marker; the trailer's whole additional
value is that it binds to a machine-readable record.

## Why it is a systemic gap and not fifteen lapses

The template that mandates the field is the same template every dispatch is built
from, and it states the requirement in bold. Records still omit it at scale. Two
readings are available and this item does not choose between them:

1. The requirement is stated but nothing checks it, so compliance decays. Nothing
   in the verify gate examines dispatch-record shape.
2. The records predate the requirement's current wording, and the gap is
   historical rather than ongoing. This is testable: compare the omission rate
   before and after the commit that last strengthened that bullet.

The second reading is checkable cheaply and should be checked first, because it
decides whether the remedy is a backfill, a gate step, or both.

## Deliberately not asserted

The reviewer did **not** execute `dispatch-authorship-verify.mjs`, because it
could not rule out that the script writes an evidence artifact and its read-only
constraint takes precedence. So this item records a measured absence of a field
and the documented entailment of that absence. It does **not** claim an observed
`UNVERIFIABLE` verdict from the checker. Anyone acting on this should run the
checker first and record what it actually says — the entailment may be stated more
strictly in the template than the implementation enforces.

## Directions, none pre-selected

1. Make dispatch-record shape a gate step, so an omission is caught at the
   boundary rather than by a Critic reading one record.
2. Backfill the field for records whose commits are still reachable, accepting
   that a reconstructed list is weaker evidence than one written at dispatch time.
3. Narrow the template's claim to what is actually enforced, if the checker turns
   out to treat the field as optional — the gap would then be in the documentation
   rather than in the corpus.

## Direction 1 is done, 2026-09-03 — and it turned the item's own numbers over

`1c2425f190d5e4a540cccc58fd41a082a4225341` (`NVA-B-RECSHAPE-1`) added
`checkDispatchRecordShape` to `harness/scripts/check-dispatch-provenance.mjs`,
validating all three conditions `agent-obligations.md` §6 entails: the record
exists at the canonical path, its `outcome` is terminal, and `report.changedFiles`
covers the commit's own paths. Three distinct finding classes, judged per commit
against that commit's own diff.

**Reported, not fatal**, with a named graduation marker
(`pipeline.dispatch-record-shape-is-fatal`) at the point where that flips. A
falsifier test pins the non-fatality directly: a valid trailer naming a missing
record produces a finding while `ok` stays true and the exit code stays 0. The
existing 23 tests pass unmodified, and a dedicated test proves the stage-0
exemption still clears a commit with no record at all. 32/32, re-run
independently by the dispatcher.

**The measurement, over `HEAD~500..HEAD`** — 500 commits, 462 touching source,
205 carrying a valid trailer:

| Class | Count |
|---|---|
| `DISPATCH-RECORD-MISSING` | 160 (159 absent, 1 unreadable) |
| `DISPATCH-RECORD-NOT-TERMINAL` | 4 |
| `DISPATCH-RECORD-PATHS-UNCOVERED` | 9 (7 absent, 2 incomplete) |

This item was filed on "roughly 60 of about 130 records carry the field". The
dominant failure is not a missing field at all — it is a missing **record**, 160
against 9.

## Why the graduation is blocked on a different item

The reason 160 records are absent is that `evidence/` is gitignored. The records
were written; they do not travel. In a fresh checkout or a CI run, every
trailer-bearing commit reports `DISPATCH-RECORD-MISSING` regardless of how
disciplined the authoring dispatch was.

So flipping the marker is not a matter of corpus quality or of a backfill
campaign. It requires deciding first whether durable provenance belongs in a
gitignored directory — which is
`backlog/items/2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md`,
and which `bb079c96` explicitly declined to settle when it pointed every rule at
`evidence/dispatch-record-<TASK_ID>.json`. Three items now converge on that one
question.

Direction 2 (backfill) would be wasted work until it is answered, and direction 3
is refuted: the checker does not treat the field as optional, so the gap is in the
corpus and its storage, not in the documentation.

## Residual, reported by the implementing dispatch against its own work

`DISPATCH_LINE_RE` matches `Dispatch:` anywhere in the raw message text rather
than through git's trailer-block parser. Consequences in both directions: a
commit whose trailer block was swallowed into the body — the defect recorded in
`backlog/items/2026-09-01-every-stage-0-commit-loses-its-assistance-marker-to-a-blank-line.md`,
eight instances — is still seen here, where git itself sees nothing; and body
prose merely mentioning `Dispatch:` would be accepted. This is pre-existing
behaviour, not introduced by that commit, and changing it would alter an existing
finding class, which the briefing forbade. It stays open as a follow-up.

## Progress note, 2026-09-04 — dispatched, nothing to build, and why it stays open

NVA-B-RECBIND-1 was dispatched against this item and **made no change, correctly**.
It is recorded here so the next session does not spend a second run rediscovering
the same thing — the stale-premise cost this repository has already measured three
times in one block.

**Direction 1 is implemented.** The record-shape checker landed as `1c2425f1`
(NVA-B-RECSHAPE-1, 2026-09-03). What remains is its graduation to fatal, and that
is blocked — not on effort, but on
`backlog/items/2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md`:
a checker cannot be made fatal against a corpus that lives in a gitignored
directory, because the corpus a gate sees is not the corpus anyone else has. That
dependency was already stated in this item and is confirmed live.

**The stated proportion no longer holds, in the good direction.** "Roughly half"
was the original figure; measured against the live corpus on 2026-09-04,
**49 of 65 records (75%) carry `report.changedFiles`**. The figure moved because
`evidence/` is gitignored, so no two checkouts share a corpus — which is the same
property that blocks graduation, seen from the other side.

**One thing the dispatcher raised and that turned out not to be a defect.** The
briefing pointed at an asymmetry in `dispatch-authorship-verify.mjs`: a record
omitting `agentType` entirely scores PASS, while one declaring `agentType` without
`effort` is downgraded to FAIL as `model-mismatch` — omitting more information
scoring better than omitting less. Both halves are deliberate and documented in
canon, in two separate places:

- `plugins/pipeline-core/lib/agent-model-registry.mjs`, `CORPUS COMPATIBILITY`
  docstring: every record predating the mechanism has no `agentType`, so its
  absence is silent by design, never a mismatch.
- `templates/prompts/goldfish-task.md` field 6: `effort` is not optional once
  `agentType` is declared, with the empirical confirmation named.

It also barely bites: of 50 records carrying `agentType`, 3 lack `effort`. Recorded
as answered so it is not re-raised as a finding. It belongs to dimension 4
(record↔agent-definition), not to this item's dimension 1/3 (record↔commit).

**Status: open, blocked on the gitignored-corpus item.** Not a candidate for a
dispatch until that one moves.

## A new, distinct failure mode, 2026-09-04 — task-ID reuse permanently orphans one of two commits

Found operating this session's own dispatch practice, not by a dispatch. Not the
blank-line spacing defect (`2026-09-01-every-stage-0-commit-loses-its-assistance-marker-to-a-blank-line.md`)
and not the gitignored-corpus problem this item names — a third mechanism on the
same record↔commit binding surface.

The Elephant issued the task id `NVA-B-CRITICWRITE-1` twice, three days apart,
for two genuinely unrelated work packages: once on 2026-09-03 (an ADR draft,
commit `f262a5c7`), once on 2026-09-04 (implementing the write location the ADR
proposed, commit `b72e22b2`). Both commits carry the identical, correctly-formed
trailer `Dispatch: NVA-B-CRITICWRITE-1 (goldfish)`. Because
`evidence/dispatch-record-<TASK_ID>.json` is a single file per task id, only one
commit can ever be bound through it.

`dispatch-authorship-verify.mjs --commit f262a5c7` now `PASS`es (the record was
restored to describe it, since it was chronologically first). The same check
against `b72e22b2` **fails permanently**: `record-names-different-commit`. No
record content can fix this — the trailer itself, in immutable history, names a
task id whose evidence slot the earlier commit already owns. This is the same
"amending is unavailable, the defect stays" shape as the trailer-spacing
instances, reached by a different route: not a malformed trailer, but two
well-formed ones colliding on one task id.

**Cause, stated plainly:** nothing checks a task id for uniqueness before a
dispatch is issued under it. The dispatcher (the Elephant) is the only party who
could catch this, and did not, on either occasion — the second dispatch's own
briefing named a task id already used by a completed, unrelated package three
days earlier in the same session's own history, and nothing surfaced the
collision until the record file was about to be overwritten.

**Not filed as a fourth item.** The mechanism is close enough to this item's own
subject (record↔commit binding integrity) to belong here, and the remedy is the
same shape a directory-contract check already applies elsewhere: before writing
`evidence/dispatch-record-<TASK_ID>.json` as the opening act, a dispatch could
check whether the file already exists and belongs to a different, completed
package — refusing to silently overwrite it is cheaper than the check this item
already asks for on the read side.
