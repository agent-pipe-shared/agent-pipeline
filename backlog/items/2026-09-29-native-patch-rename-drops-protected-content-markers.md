---
schema: pipeline.backlog-item.v1
id: pipeline.native-patch-rename-drops-protected-content-markers
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
source: "Source-confirmed guard-apply-patch content scan during the Alfred native EOF correction."
---

# Preserve protected content facts when a native patch renames a file

The content scan in `guard-apply-patch.mjs` cleared its active path at
`*** Move to:`. A renamed Update containing the canonical acknowledgement
marker therefore produced false content facts for both original and target
paths. The same plain Update retained the marker. EOF termination is not
required to reproduce the defect. This can omit writer-only lifecycle checks
on a protected marker; no actual authority mutation was attempted.

## Correction evidence

The bounded Source correction carries content facts to both identities and
isolates them between operations. Five actual directed controls pass: marker
denial with and without EOF, harmless rename, operation isolation and inactive
scope. Both syntax and exact inverse checks pass 2/2. Evidence:
`scratch/0.7-rename-content-marker-preservation-20260929/manifest.json`, SHA
`17a53d4f828150e2ba74841faa3a8cccaabac98c1a8547087dab86cb319ea276`.

## Acceptance

- Marker writes through Update or rename reach the same writer-only check for
  original and destination identities, with and without a native EOF marker.
- Harmless rename and inactive repository behavior remain admitted; unrelated
  operations do not inherit another file's facts.
- The fixed committed candidate and installed guard retain these controls.
  Source directed evidence alone does not close installed acceptance.

The earlier full suite remains 18 pass/5 fail: four held-writer dependencies
and one readiness-wording assertion. It predates this correction and is not a
final candidate PASS. Keep this item open until integrated qualification.

## Triage

- **2026-10-08 close-out check:** not closable — installed-guard acceptance needs host run; item requires integrated qualification.
- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `26fef9e7d`, host run needed.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — Run the controls against the installed guard on the candidate host (acceptance bullet 3); triage says a host run is needed
  Run lib/pins/native-patch-rename-drops-protected-content-markers.test.mjs on Linux; it drives guard-apply-patch.mjs as a process with synthetic patches (marker denial with/without EOF, harmless rename, isolation, inactive scope), no model call. Re-run it against the installed plugin-cache copy after the optional post-sitting dev-build install.
