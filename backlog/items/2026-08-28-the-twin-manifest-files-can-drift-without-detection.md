---
schema: pipeline.backlog-item.v1
id: pipeline.twin-manifest-files-can-drift-without-detection
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: 131a990193853f425b11381c7f0c44d3ef6d77fe
closure_repository: "self"
closure_evidence: plugins/pipeline-core/lib/project-authority.test.mjs
created: 2026-08-28
sprint: nightwing
source: "Claude/Windows greenfield run, 2026-08-28, sections 7 and 11 of its own analysis (docs/pipeline-haertungstest-und-analyse.md)."
done_when: contains plugins/pipeline-core/lib/project-authority.mjs PA-CALIBRATION-DRIFT
---

# `.claude/pipeline.json` and `project/pipeline.json` drifted, and no check noticed

## What happened

In the Claude run, `project/pipeline.json` carried the corrected verify contract
while `.claude/pipeline.json` still held the original placeholder. The compiled
twin is not projected from `project/` when the field is absent from
`pipeline.user.yaml`, so the two files silently disagreed about what the project's
verification actually is.

## Why it matters beyond tidiness

Which file a given consumer reads decides what the project's verify contract *is*.
A drifted pair means the answer depends on the reader — and this repository has
already been bitten by exactly that class of defect elsewhere: a checkout that
lags the installed plugin runs the wrong human-approval code, filed separately.

## Direction

Include the twin pair in the existing projection/drift check, so a divergence is
reported the way other drift already is, rather than remaining invisible until
someone compares the files by hand.

## Acceptance criteria

- A divergence between the two files is reported by the drift check.
- The check names which file is authoritative for the diverging field.

## Closed, 2026-09-01 (NVA-B-STALECLOSE)

Re-verified independently, both halves of AC-1: (1) read this item's own
text in full — both Acceptance bullets ask only for detection + naming the
authoritative file, nothing more; (2) `git log --oneline -S
"PA-CALIBRATION-DRIFT" -- plugins/pipeline-core/lib/project-authority.mjs`
resolves to commit `131a9901` ("fix(project-authority): detect twin
calibration drift in classification"), and reading the current code confirms
`calibrationDriftDiagnostics()` (`project-authority.mjs` lines ~354–364)
compares the two calibration files' sha256, emits `code: "PA-CALIBRATION-
DRIFT"` on divergence, and names `authoritative` (the resolved source tier)
in the finding — satisfying both Acceptance bullets directly, not merely
matching the `done_when` needle string. `plugins/pipeline-core/lib/
project-authority.test.mjs` carries a dedicated `PA-CALIBRATION-DRIFT` test
case; re-ran the full suite: `node --test
plugins/pipeline-core/lib/project-authority.test.mjs` — 36/36 pass.
