test(architecture-close-disposition): create scratch/ before the ACD003 fixture

ACD003 created its fixture with mkdtemp under the repository's
scratch/ folder, which is untracked: in a fresh clone (the workers of
scripts/run-parallel.mjs) it failed with ENOENT before testing
anything. The test now creates scratch/ first.

AI-Assisted: true
Dispatch: stage-0 (elephant)
