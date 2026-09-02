---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-records-are-written-to-a-name-the-verifier-cannot-find
type: defect
owner: pipeline
status: open
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
