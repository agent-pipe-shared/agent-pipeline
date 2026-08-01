# Private overlay and cleanup (lazy)

Private overlay status is mutation-free until a typed, digest-bound action is
confirmed. `session-cleanup.mjs plan-privatization --repo "$PWD"` must return
`pipeline.session-cleanup-privatization-plan.v1` with one complete applyAction,
the same physical root and plan digest, `mutation:true`,
`requiresConfirmation:true`, and host boundary. Present unchanged; wait for
the PO; execute exactly once; restart Step 0. Never edit Consumer State,
delete descriptors or claim readiness before a repeated V4 `ready` result.

