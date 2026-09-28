---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-home-override-does-not-bind-machine-plane
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-28
source: "Controlled Codex onboarding first-answer verification; source dependency mismatch and a synthetic differing OS-home/CLI-home counterprobe. See scratch/onboarding-answer-route-evidence.md. No ordinary native-home defect or release blocker is claimed."
sprint: none
done_when: manual
---

# Keep machine-plane reads within the selected onboarding home

## Description

The project-onboarding CLI's supported `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE`
sets `deps.homedir`, but its library default `readMachinePlane` still uses its
own imported OS home. `observeLocalTrustAnchorPointer` calls that reader without
passing the selected home dependency. A consumer of the dependency seam can
therefore observe one home for profile paths and another for the machine-plane
public trust-anchor projection.

Two first-answer fixtures initially imported a public anchor despite an empty
selected home. A separate controlled counterprobe uses only synthetic machine
and public policy metadata: substituted OS home A, explicit CLI home B empty,
and unchanged product module bytes. The generated portable v3 policy imports
A's anchor; both homes' inputs remain unchanged. No private key is read/created.

The driver already aligns HOME/USERPROFILE for normally spawned children.
The counterprobe substitutes the OS provider and establishes the incomplete
dependency seam, not failure of that normal native environment bridge. No
production compromise, ordinary native-home failure or release blocker follows
from this evidence alone. It does expose non-hermetic verification and makes
the declared home-selection contract depend on ambient provider behavior.

## Affected artifact

`plugins/pipeline-core/lib/project-onboarding-v3.mjs` dependency defaults and
`observeLocalTrustAnchorPointer`, its CLI home override, machine-plane reader
and isolated onboarding fixtures.

## Proposal

Propagate the selected home explicitly to the default machine-plane reader,
while retaining a caller's explicit reader override. Use the same selected
scope for public trust-anchor observation and portable projection. Preserve
normal native-home behavior. Fixtures should not need to replace the global
OS provider or obtain public machine identity from the real operator's home.

## Acceptance

- Library calls with injected home B read B's machine plane and public anchor,
  even when their controlled OS provider reports different home A.
- Direct supported CLI override and ordinary driver projection agree on the
  selected home, with no read/write of the other fixture home's plane.
- Explicit reader overrides and callers without a home override retain their
  documented behavior; invalid/absent selected planes are not silently replaced
  with ambient home data.
- Controlled before/after tests cover public anchor presence, absence and
  source immutability. Native behavior and substituted-provider evidence are
  reported separately; no signing ceremony or real keys are required.

## Evidence

`scratch/onboarding-answer-route-home-counterprobe-results.json` and metadata
record the 1/1 passing reproduction, synthetic scopes and source hashes.
`scratch/onboarding-answer-route-evidence.md` records the preceding failed
isolation assertions and the successful answered-action tests with an explicitly
declared provider substitution. This item records the gap; no fix is claimed.

## Triage
