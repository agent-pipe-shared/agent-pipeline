---
schema: pipeline.backlog-item.v1
id: pipeline.no-verb-sets-the-package-candidate-or-registers-the-verify-evidence
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-11-01
sprint: alfred
source: "Finding of the D229 core-pack slice (2026-11-01), read from the code and not executed: the feature-close audit route needs a feature package in state completed with a candidate and a Verify candidate-evidence entry, and no shipped verb writes either."
---

# No shipped verb sets the feature package candidate or registers the Verify evidence

## What was found

The feature-close audit route (`close-coordinator.mjs plan-transition --phase feature-close-prepared --audit-request ...`) calls `planFeatureCloseAudit`
(`lib/feature-close-audit-preflight.mjs`), which requires the feature package manifest to be in state `completed` with `candidate` equal to the current HEAD
commit and tree, and to hold a `candidate-evidence` artifact that is a passing `pipeline.verify-evidence.v0` for that candidate. The topology
(`lib/feature-package-topology.mjs` ~211) refuses `verifying` and `completed` packages whose `candidate` is `null`.

Reading the shipped code, the slice found no writer for either:

- registration at plan approval (`register-feature-package.mjs`, `lib/feature-package-registration.mjs`) writes the manifest with `candidate: null`; its
  candidate-evidence entry is the delivery-contract envelope, and its other modes add a review unit, Critic diagnostic evidence, a review lineage or a delta
  request, never Verify evidence;
- `feature-package-apply` is reported to replace only `state`; `feature-package-reconcile` (PO-signed) only refreshes artifact digests.

If that holds, a consumer has to hand-write `state: "completed"`, `candidate` and the candidate-evidence entry into the manifest, with correct digests, before the
audit route can plan; this is independent of the policy pack item. The state transitions `implementing -> verifying -> completed` exist in the topology table
(~238-240), so a verb may exist that the slice did not find.

## Not verified

The claim comes from reading, spot-checked by the Coordinator at the topology rule; no command was executed and the hand-edit guard status of the manifest was
not checked. The first step of the fix is to run the real chain in a clone from a registered package to `completed`.

## PO tile

None yet; the decision follows the verified chain (a verb that records the candidate and the Verify evidence is the expected fix).

Triage 2026-11-01 (candidate 15d, PO exception: built by the Elephant): the gap is confirmed on the real chain (the apply refuses with `FTP-CANDIDATE`; a consumer reproduced the
`invalid-transition` and the null candidate). The fix is held as `w38`: `register-feature-package.mjs --add-verify-evidence <path>` registers passing Verify evidence, and the first
`feature-package-plan`/`-apply` into `verifying` binds the candidate to the current HEAD when such evidence names exactly that HEAD. A chain test ends in the audit preflight planning the package.
Open: native Windows, a real consumer run, Full Verify, Critic, acceptance.
