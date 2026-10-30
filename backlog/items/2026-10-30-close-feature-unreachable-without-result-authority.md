---
schema: pipeline.backlog-item.v1
id: pipeline.close-feature-unreachable-without-result-authority
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N29, build 0.7.0+claude.20261030131902.8fc9c8b); PO direction 2026-10-30: major, into the next candidate, because work cannot be closed today"
done_when: manual
---

# A feature whose package has no result authority cannot be closed

## Evidence

A consumer feature was merged and deployed. The close then stopped:

1. `close-coordinator.mjs plan-start --close-intent durable-stop`, `apply-start` and
   `apply-transition --phase checkpointed` passed.
2. The next phase `feature-close-prepared` refused with `CLOSE-RESULT` "feature close requires a bound
   Implementation Result" (`scripts/close-coordinator.mjs` about line 216, reads
   `state.continuity.authority.result.path`, which is `null`).
3. The route that sets it, `pipeline-state.mjs continuity-result-bootstrap-plan`, refused with
   `PS-RESULT-BOOTSTRAP-PACKAGE` and no detail (`buildResultBootstrapPlan`, about line 6100).
   `resultBootstrapPackage` needs exactly one artifact with `authority: true` for each of `prd`, `spec` and
   `result`. The consumer package, registered with an earlier build, carries `result` with `authority: false`
   and `mutability: immutable`.

No sanctioned verb lifts `result` to authority in an already registered package. The feature stays active
(`planApproved: true`), and the next feature presumably cannot start.

## Wanted

1. `CLOSE-RESULT` names the next verb (`continuity-result-bootstrap-plan`) and the unmet condition.
2. `PS-RESULT-BOOTSTRAP-PACKAGE` names the failing class, path and condition (missing, not authority,
   digest mismatch).
3. A sanctioned route for a package registered without result authority: either a verb that lifts the
   registered `result` artifact to authority after a digest check, or a close route that accepts such a
   package with the result bound from the package entry. The registered history stays unchanged.
4. A close that stopped at `checkpointed` continues from there after the fix, without a restart.
5. One end-to-end replay from that consumer state: package with `result` `authority: false`, close from
   `checkpointed` through `feature-close-prepared` to a closed feature, no further refusal on the way.
