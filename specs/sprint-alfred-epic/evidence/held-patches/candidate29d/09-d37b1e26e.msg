fix(native-host): refuse a sibling's unproven host commit at once and by name (K-34)

Glossover ran three Goldfish dispatches with disjoint scopes. The first
stop made its host commit and then failed before it wrote that commit's
lineage proof (the record draft refused with the K-29 code, fixed in
29c). The other two stops met HEAD moved by a commit nothing proves,
waited in the settle loop for a proof that could not come (78 s and
27 s) and ended with the generic native-concurrent-unowned-head, which
named neither the sibling nor the order of recovery.

The concurrent plan still refuses such a commit (its lineage is not
proven), but when an in-flight sibling's stop outcome names exactly
this commit and is no recorded success, it now refuses at once with
native-concurrent-sibling-commit-unrecorded, outside the settle set, and
the error names the sibling and the commit. The hook text says which
sibling to recover first (record only, its commit exists) and that this
dispatch is recovered after it, onto the advanced HEAD.

NGSP9F runs the pair in two processes; the first stop fails right after
its commit where Glossover's did. Without the fix it reproduces the live
failure (unowned-head after about 90 s); with it the second stop refuses
by name and commits nothing. The finalizer's draftRecord step takes an
optional dependency like its other steps so the test can fail there.

AI-Assisted: true
Dispatch: stage-0 (elephant)
