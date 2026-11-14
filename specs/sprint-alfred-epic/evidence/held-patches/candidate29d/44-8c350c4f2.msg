test(native-host): drive a no-edit checkpoint through the stop finalizer

Glossover K-45 repeated K-36 (a Goldfish that stops before any edit had
no return the stop accepted). The K-36 fix (68e2720cb) was pinned at the
validator and wait-host-commit is pinned for a recorded checkpoint, but
no case ran a checkpoint with changedPaths [] through the SubagentStop
finalizer in between. NGHF17b does: it is recorded as a checkpoint
(NGHF-CHECKPOINT-RESERVATION-LIVE), with no commit and no stop-failure
diagnostic, so nothing needs a heal.

AI-Assisted: true
Dispatch: stage-0 (elephant)
