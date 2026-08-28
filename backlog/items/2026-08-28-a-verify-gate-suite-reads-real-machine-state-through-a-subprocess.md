---
schema: pipeline.backlog-item.v1
id: pipeline.verify-suite-reads-real-machine-state
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — a suite about to enter the verify gate whose outcome depends on unrelated per-machine state; found while diagnosing a one-off failure of exactly that suite"
source: "onboarding-init.test.mjs failed once (exit 1) during an operator run of apply-pending-protected-edits.mjs --only=verify-nva-c-protected, 2026-08-28. Not reproduced in five subsequent runs, three of them concurrent. The coupling below was found while looking for the cause and is verifiable independently of it."
---

# A verify-gate suite reads real per-machine state, because it drives a subprocess

## What is verifiable

`plugins/pipeline-core/scripts/onboarding-init.test.mjs` drives the guided-init driver,
which spawns `project-onboarding-v3.mjs` as a real subprocess. Dependency injection stops
at that process boundary: the child resolves its own dependencies, including
`readMachinePlane()` against the real `$HOME`.

That was tolerable while the machine plane only influenced hints. It stopped being
tolerable today: `freshCriticalHumanProofPolicyBytes()` now consults
`detectExistingLocalTrustAnchor(fs)` and seeds a trust anchor when this machine has a
signing key. So the same suite now produces materially different onboarding output on a
machine with a PO key than on one without — including a different
`project/critical-human-proof.json` schema version.

A suite in the verify gate should not have two legitimate outcomes depending on who runs
it. Worktree isolation cannot fix this: the machine plane lives outside the repository, so
every worktree, and every concurrent dispatch, shares exactly one of them.

## The failure this was found through, stated honestly

During an attended operator run, `onboarding-init-tests` exited 1 and the applier
correctly refused the whole step and restored `verify.mjs`. It has not reproduced: five
subsequent runs, three of them concurrently under the same parallel-dispatch load, all
passed, as did two applier previews.

So the coupling above is **not established as the cause**. It is filed because it is real,
independently checkable, and is the kind of coupling that produces exactly this signature.
Do not close this item by asserting the two are the same thing without evidence.

Ruled out while looking: the applier's own 600s spawn timeout (the suite takes ~1.7s, and
a timeout kill would report a null status, not exit 1); `machine-plane.test.mjs` and
`po-human-approval.test.mjs` writing the real plane (both inject a fixture `homedirFn`
pointing into `scratch/`).

## Direction

Give the driver a way to run its child against an injected home/machine-plane, and have
the test use it — the same seam the in-process suites already have, extended across the
process boundary (an environment variable the child honours is the cheap form). The point
is that the suite's result depends only on its fixture.

Then, separately, decide whether the one-off failure warrants further hunting or whether a
deterministic suite makes the question moot.

## Acceptance criteria

- `onboarding-init.test.mjs` produces the same result on a machine with a PO key and on
  one without, provably — e.g. the suite runs both cases explicitly from fixtures.
- No verify-gate suite reads real `$HOME` state through a spawned child.
- The applier's `--only=verify-nva-c-protected` step registers all five suites green on a
  quiesced tree.

## Related

- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` — the change that turned
  a latent coupling into a behavioural one.
