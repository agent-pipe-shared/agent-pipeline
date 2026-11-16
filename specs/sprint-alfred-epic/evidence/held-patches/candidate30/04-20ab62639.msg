fix(guard): list design-review-observation as a kernel path (C30-6)

guard-dispatch.mjs, already a kernel path, now imports
design-review-observation.mjs to count readiness-review rounds that never
reached a receipt. The transitive-closure suite (GMWKC01) requires every
such import in NEVER_LIFTABLE_KERNEL_PATHS, and the threat model lists every
entry (GMWKC03). Both are extended.

AI-Assisted: true
Dispatch: stage-0 (elephant)
