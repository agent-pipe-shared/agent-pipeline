---
schema: pipeline.backlog-item.v1
id: pipeline.baseline-only-verify-needs-an-actionable-release-recovery
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
created: 2026-09-13
sprint: nova-b
tracking: "Nova B — the intentionally permitted baseline-only verify state becomes expensive when it is discovered late at push time and a runner cannot discover the exact recovery through its normal driver."
source: "evidence/pipeline-analysis-agy-062-103.md; evidence/pipeline-retrospective-2026-09-13.md."
---

# A deliberate `verify: null` state has no uniformly discoverable late recovery

Fresh onboarding deliberately seeds `verify: null` so a project with no tests
does not need an invented command before implementation.  That policy is sound.
The current reports nevertheless show that a runner can reach release with the
state still unset, receive a failing verification gate, and need an improvised
scratch-script route instead of an exact driver action.

This is not a request to make an empty verify contract pass.  It needs one
driver-visible, PO-confirmed command-collection/replacement route that works
both before implementation and when push readiness first detects the omission.

## Acceptance criteria

- Baseline-only verification stays honestly non-passing for push/release.
- Every runner's ordinary onboarding/push driver exposes the same typed recovery
  action without shell reconstruction.
- A test follows fresh seed → implementation → late discovery → confirmed
  configured verify → push readiness without scratch files or a human guard
  override.
