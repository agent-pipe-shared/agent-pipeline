---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-records-are-written-to-a-name-the-verifier-cannot-find
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: bb079c96f8e56531635cfc0d1c3385fbd3536156
closure_evidence: backlog/evidence/2026-09-03-nova-b-batch-1-closure-verification.md
created: 2026-09-03
sprint: nova-b
tracking: "Nova B — the authorship verifier reads exactly one filename shape in exactly one directory; two dispatches in one day wrote their records under a different name in a different directory, in good faith, following the directory contract."
source: "Measured 2026-09-03 during the autonomous Nova-B run: NVA-REBDEAD-F8 and NVA-B-LEDGEROID-1 each wrote backlog/evidence/<TASK_ID>.dispatch-record.json, and evidence/dispatch-record-<TASK_ID>.json did not exist for either, so dispatch-authorship-verify.mjs would have reported record-missing for commits d08ca247 and 75312525."
done_when: manual
---

# Dispatch records get written to a name the authorship verifier cannot find

## What happens

`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` resolves a
dispatch record by exactly one construction (`readRecordFile`, ~`:607-615`):

```js
const path = join(evidenceDir, `dispatch-record-${taskId}.json`);
```

with `evidenceDir` defaulting to `DEFAULT_EVIDENCE_DIR = join(REPO_ROOT, "evidence")`
(`:118`). Anything else is invisible to it, and a commit whose `Dispatch:` trailer
names a task with no findable record is reported `record-missing` (`:522`).

On 2026-09-03 two dispatches in the same run each wrote
`backlog/evidence/<TASK_ID>.dispatch-record.json` instead — a different filename
shape in a different directory. Neither canonical file existed. Both commits
(`d08ca247`, `75312525`) would have failed authorship verification until the
canonical copies were placed by hand.

## Why this is a contract conflict, not two careless agents

Both dispatches were reasoning correctly from the rules they were given, and
those rules disagree:

- ADR-0063's directory-kinds table sends **tracked** evidence a gate or a
  backlog `closure_evidence` field cites to `backlog/evidence/`, and
  machine-regenerated evidence to the gitignored root `evidence/`. A dispatch
  record is durable provenance, so `backlog/evidence/` reads like the right home.
- `pipeline.fourteen-evidence-files-are-tracked-inside-a-gitignored-directory`
  is an open item complaining about exactly the opposite placement, which
  reinforces the same instinct: get tracked artifacts out of `evidence/`.
- The verifier, meanwhile, reads only the gitignored `evidence/` root, with a
  filename shape (`dispatch-record-<id>.json`) that is the mirror image of the
  one the dispatches chose (`<id>.dispatch-record.json`).

So an agent following the directory contract writes a record the verifier
cannot see, and an agent following the verifier writes into a directory another
open item says tracked artifacts should leave. Neither is wrong on its own
terms.

## What makes it worse than a naming nit

The failure is silent at write time and only surfaces in a full `verify.mjs`
run, ~10 minutes later — and it surfaces as `record-missing`, which reads like
"this dispatch never wrote a record" rather than "the record is at the other
name". The 2026-09-03 run only caught it because the dispatcher happened to read
`readRecordFile`'s source while investigating something else.

## Directions — options only, no decision made here

1. Have the verifier accept both shapes and both directories, preferring the
   canonical one. Cheapest; hides the disagreement rather than settling it.
2. Settle the contract: decide whether a dispatch record is tracked provenance
   or regenerable evidence, record it in ADR-0063's table, and make the verifier
   read only that. Resolves this and
   `pipeline.fourteen-evidence-files-are-tracked-inside-a-gitignored-directory`
   with one decision.
3. Have the record be written by a shared helper rather than hand-composed per
   dispatch, so the path is not a per-briefing judgment call at all.

Option 2 is the only one that removes the ambiguity rather than tolerating it,
and it is a decision (EL-04), not an implementation.

## Affected artifacts

- `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` — `readRecordFile`, `DEFAULT_EVIDENCE_DIR`
- `docs/adr/0063-repository-directory-contract.md` — the directory-kinds table
- `templates/prompts/goldfish-task.md` — where a dispatch learns what to write
- `backlog/items/2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md`
- `backlog/items/2026-09-01-half-the-dispatch-records-omit-the-field-that-binds-them-to-their-commit.md`

## Third instance, same day, worse shape — 2026-09-03

`NVA-B-STEMCLASH-1` wrote its record to the repository ROOT as
`taskId-nva-b-stemclash-1-dispatch.json` — a literal, unexpanded `taskId-`
prefix, lowercased, in a directory that is neither of the two candidates the
contract argues about. `dispatch-authorship-verify.mjs` would report
`record-missing` for commit `70eb60f4`; the file was relocated by hand to
`evidence/dispatch-record-NVA-B-STEMCLASH-1.json`.

Three dispatches, three different answers, in one run:

| dispatch | wrote to |
| --- | --- |
| `NVA-REBDEAD-F8` | `backlog/evidence/<ID>.dispatch-record.json` |
| `NVA-B-LEDGEROID-1` | `backlog/evidence/<ID>.dispatch-record.json` |
| `NVA-B-STEMCLASH-1` | `./taskId-<id-lowercased>-dispatch.json` |

None matches `evidence/dispatch-record-<ID>.json`. That is no longer a
contract two documents disagree about — it is a path nothing reliably
produces, which strengthens Direction 3 (a shared helper writes the record)
over Direction 1 (teach the verifier more shapes): there is no finite set of
shapes to teach.

## A second defect from the same dispatch — a report that did not match the tree

`70eb60f4`'s own report states it used `git mv` "so the rename is recorded as
a rename". It did not. The commit adds the new evidence file and never stages
the old one's deletion, which stayed tracked and present until a later
`git add -A backlog/` in the dispatcher's own ledger commit (`a3b90039`) swept
it in. The rename is complete only across two commits, one of which claims in
its message that nothing else moves.

Two things this is evidence for, recorded here because it was observed here:

- `pipeline.concurrent-dispatches-in-one-shared-checkout-collide-in-ways-no-guard-catches`
  observation 4 — a completion report disagreeing with the committed state.
  This is another instance, and the disagreement was in the direction that
  looks like success.
- The dispatcher's own `git add -A <dir>` is the same hazard every briefing in
  this run forbade to dispatches, for the same reason. It swept a file the
  dispatcher did not intend to touch. Explicit paths belong on the orchestrator's
  commits too, not only on the agents'.
