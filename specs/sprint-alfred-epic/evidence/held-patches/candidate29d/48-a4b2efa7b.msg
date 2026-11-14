fix(toolchain-doc): name no source-only harness path in shipped files

check-consumer-safe-paths (AC-11) was red on the applied 29c chain: the
generated toolchain document header, its renderer and the registry
comment named harness/scripts/generate-toolchain-doc.mjs, a path a
consumer's installed plugin does not have. They now say "the source
repository's generator script"; docs/toolchain.md and its vendored copy
are regenerated (registry drift test 9/9, consumer-safe-paths 9/9).

AI-Assisted: true
Dispatch: stage-0 (elephant)
