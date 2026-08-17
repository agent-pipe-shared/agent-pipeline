---
schema: pipeline.backlog-item.v1
id: pipeline.evidence-gitignore-left-dozens-of-durable-artifacts-untracked
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Found 2026-08-17 while trying to commit a fresh acceptance-evidence-map snapshot: git silently refused to see the new file. Traced to .gitignore's unanchored `evidence/` rule matching specs/sprint-phoenix-epic/evidence/ too, fixed in commit 13811594."
due: 2026-08-24
---

# Fixing the evidence/ gitignore anchor revealed dozens of previously-untracked durable artifacts under specs/sprint-phoenix-epic/evidence/

## Description

`.gitignore`'s `evidence/` rule (intended for the repo-root run-output directory,
QG-03) was unanchored and also matched `specs/sprint-phoenix-epic/evidence/` — a
directory the acceptance-evidence-map.mjs generator's own header comment
explicitly documents as durable package-artifact storage, not regenerated run
output. Fixed in commit `13811594` (`/evidence/`, anchored to root).

Fixing the pattern immediately surfaced ~75 previously-untracked files under
`specs/sprint-phoenix-epic/evidence/` — dispatch records, verify/security-scan
snapshots bound to specific historical commits, authority-revision proposal
JSONs, diff snapshots, and at least one earlier acceptance-evidence-map dated
snapshot (`acceptance-evidence-map-20260805.md`) that a reader following
`git log` on that directory would never have found. Unknown how far back this
goes or how many sessions' evidence was silently never committed.

## Triggering situation

2026-08-17, correcting `closure-plan.md` against current code state, writing a
new dated evidence-map snapshot (`acceptance-evidence-map-20260817.md`) and
discovering it wouldn't `git add`.

## Affected artifact

`specs/sprint-phoenix-epic/evidence/**` (untracked contents specifically);
`.gitignore` itself (already fixed).

## Proposal

Triage the untracked pile before adding it wholesale (some of it may genuinely
be regenerated/disposable working output that was never meant to be durable,
despite living in this directory — the generator's own comment establishes
intent for *that file*, not necessarily every sibling). Suggested approach:
group by pattern (dispatch-record.json / verify-*.json / diff-snapshot.txt /
proposal.json / etc.), decide per group whether it's durable evidence (commit)
or working scratch that happened to land in the wrong directory (leave
untracked, or relocate to `scratch/`), then `git add` the durable groups in
one deliberate pass — not a blanket `git add -A` on the whole directory, which
risks committing something that should not be in history without a look.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
