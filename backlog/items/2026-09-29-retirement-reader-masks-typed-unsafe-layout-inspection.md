---
schema: pipeline.backlog-item.v1
id: pipeline.retirement-reader-masks-typed-unsafe-layout-inspection
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
source: "Actual public unsafe-layout probe after the complete onboarding controller's bounded timeout, 2026-09-29."
---

# Preserve typed unsafe-layout inspection before reading retirement history

The V4 inspector already rejects an unsafe root or descendant layout and
constructs a typed result. `inspectProjectOnboardingV3` subsequently invokes
the enrollment retirement reader anyway. A symlink-root probe and the
original unsafe-layout callback then throw `GS-ALIAS`, hiding the existing
`unsafe` result, rejected-root diagnostics and repository availability.

This is a public inspection defect, not permission to accept aliases or
ignore retirement history on an admitted root. The complete controller's
earlier timeout remains a failed, incomplete trajectory: 143 PASS, 8 FAIL
and 33 unobserved callbacks, receipt `3472d2fb8993458dc1d14371ce8774ff046f567ba0502c1f4b5452db9b23e59a`.

## Correction and evidence

Return the already constructed V4 result when its root is null or its status
is `unsafe`, before enrollment inspection. Retain physical rejection and
all original diagnostics/actions. Do not catch or relax enrollment errors
on admitted roots.

Delivered Source correction:
`scratch/0.7-onboarding-fixture-source-failure-repair-20260929/alias-source-correction/manifest.json`,
SHA `cfde37eb71156e0fe9d3cf4b19e3f16e7ea33bb2fe8e83be3c38b45a86bd2c5e`.
The unchanged original callback passes 1/1 with actual Source FD completion.
The initial null-root-only correction failed on the unsafe descendant case;
its distinct receipt remains retained. No overall onboarding PASS is claimed.

## Acceptance

- Public inspection returns typed `unsafe` results for rejected roots and
  descendants, including `root_symlink_rejected` and unavailable repository
  diagnostics where applicable.
- No enrollment reader runs against a V4-rejected physical layout.
- Admitted roots retain canonical selected-root retirement/history validation;
  corrupt or unsafe owned history is not silently accepted.
- Preserve the original callback and assertions, qualify the complete original
  onboarding controller and fixed candidate's broader gates.
- Keep this item open until combined candidate acceptance.

## Triage

- **2026-10-08 close-out check:** not closable — named test exceeded 600s, needs host run; combined gates unmet
