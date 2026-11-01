---
schema: pipeline.backlog-item.v1
id: pipeline.a-second-diagnostic-for-one-candidate-makes-the-lineage-unregistrable
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N44 (2026-10-31): after a second diagnostic for the same candidate, preflight, admit, finalize and export pass but the lineage cannot be registered (FPR-LINEAGE-COMPILE / CCA-DELTA-BINDING); confirmed on the consumer manifest."
---

# A second diagnostic for the same candidate makes the Critic lineage unregistrable, with no hint

## What happened

Diagnostic 1 (without `--base`) was registered; the preflight then demanded a required guardrail; diagnostic 2 (with `--base` = the preflight
base) was registered too. `--add-delta-request` wrote a new request whose `deterministicEvidence` carries BOTH diagnostics. Preflight, admit,
finalize and export passed (the packet's evidence paths name diagnostic 2 only). Only `register-feature-package --add-review-lineage`
refused: `FPR-LINEAGE-COMPILE` with `CCA-DELTA-BINDING`. The candidate was not healable; a new non-evidence commit with ONE diagnostic was needed.

## Cause (code evidence, confirmed on the consumer manifest)

- `lib/critic-course-admission.mjs` 649-660: `deterministic()` with no paths collects every good diagnostic of the candidate; the delta request
  read (line 679) demands strict equality of its `deterministicEvidence` with that set.
- `lib/feature-package-registration.mjs` 546-553: the lineage compile takes the FIRST delta-request artifact in manifest order whose candidate
  commit and base match, then stops. The manifest held two requests for the candidate; the older one (built when only diagnostic 1 existed)
  comes first and no longer matches the full set.

## Proposed direction

Pick the newest matching request, or refuse a second diagnostic for a candidate that already has a registered delta request, at the moment it is
registered, naming the consequence. Preflight and admit should check the same evidence selection the lineage compile uses, and the refusal
should name the paths that differ. Meanwhile: register exactly one diagnostic per candidate.

Triage 2026-11-01 (candidate 15c): the selection half is held as `w37` (the lineage compile takes the newest matching request). The
early refusal at registration time and the preflight/admit selection check are not built.
