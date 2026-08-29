---
schema: pipeline.backlog-item.v1
id: pipeline.twin-manifest-files-can-drift-without-detection
type: defect
owner: pipeline
status: open
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
