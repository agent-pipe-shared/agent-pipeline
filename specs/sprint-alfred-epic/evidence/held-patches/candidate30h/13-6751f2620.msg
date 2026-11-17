fix(guard): the model exception store is a never-liftable kernel path

guard-dispatch.mjs and dispatch-model-enforcement.mjs import lib/dispatch-model-exception.mjs, so the kernel closure test (GMWKC01) required it in NEVER_LIFTABLE_KERNEL_PATHS; the threat model prose lists it (GMWKC03). A maintenance window covering the store would let one edit decide which model a dispatch is admitted on.

AI-Assisted: true
Dispatch: stage-0 (elephant)
