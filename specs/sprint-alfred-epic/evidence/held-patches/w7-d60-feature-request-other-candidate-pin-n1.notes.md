# N1: pin the feature-request admit of another candidate over a held packet (Toolbox D60)

State: HELD PATCH, test only, independent of every other held patch (one inserted case after `D60 c7 (a) pin` in `session-critic-finalizer.test.mjs`; no production code). Nothing applied, reviewed or accepted. Written and measured by the Elephant.

## Why
The backlog entry for D60 says the "feature-request admit path for a different candidate" is unpinned. A re-read of the current tests (before dispatching, as the re-verify rule demands) showed the entry is partly stale: the generic path is pinned by `D60 c4 (a)`, the release verb end to end by `D60 path release`, the lost-index resume by `D60 c3`, the same-task feature-request resume by `D60 c7 (a)`. Only the feature-request path with another candidate had no case.

## Measured behaviour (probe, then pin)
Another candidate on the feature-request path is not treated as a held-packet case at all: the exact-candidate evidence binding refuses it first, code `CDP-EVIDENCE-BINDING` ("Evidence is missing or stale for the exact candidate"). The held packet is untouched, the refused request claims no packet of its own, and the original request still completes the held packet (`admitted`). The case pins exactly that.

## Evidence
- Apply check on HEAD (`3d95013d1` and later): exit 0.
- Finalizer suite on a fresh clone of HEAD with this patch only: 88 tests, 87 pass, 1 fail; the one failure is the known baseline case `private task snapshot binds uppercase delivered-v3 bytes ...` (fixed by patch 15, independent). The new case passes. Baseline without the patch: 87 tests with the same one failure.
- It is a characterization pin of existing behaviour, so there is no RED run against unfixed code.

## NOT done
No Full Verify, no Critic review, no pin number change (the finalizer file has no VCR01 row). The different-task-same-target semantics stay a PO decision. The native Windows run of D60 stays open.

## Proposed commit message
test(critic): pin that a feature-request admit of another candidate leaves a held packet alone (D60)

## Operator flow
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-d60-feature-request-other-candidate-pin-n1.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-d60-pin.txt`.
