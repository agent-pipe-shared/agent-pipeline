# TMPDACL — Codex pretool suite before/after (native Windows)

Change under measurement: `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` takes `tmpdir` from the new
helper `plugins/pipeline-core/lib/test-support/private-tmp.mjs` (a hardened, process-private temp root) instead of
`node:os`, so fixtures no longer sit under an OS temp root that grants non-owner principals.

| Run | Tree | Command | exitCode | Duration | Failing numbered cases |
|---|---|---|---|---|---|
| before | `git archive` export of HEAD at the time (scratch copy) | `node --test --test-timeout=120000 plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` via `capture-evidence.mjs` | 1 | 2907 s | 1, 6, 7, 8, 10, 11, 13–20, 22–32, 35–37 (31) |
| after | working tree with the helper and the import swap | same | 1 | 2865 s | 6, 7, 8, 10, 11, 13–20, 22–32, 35–37 (30) |

Result: no case that passed before fails after. Case 1 ("Codex manifest matches the repository version and has a
native hook descriptor") fails only in the export run; the likeliest cause is the export's manifest/version context,
not the helper — not investigated further.

The 30 remaining failures are the same in both runs. The first failures in both logs are assertions in
`createReadyLifecycleFixture` that read `'command'` where `'architecture-design-required'` was expected (the
fresh-clone `bootstrap-binding-required` onboarding state, family A of the fresh-clone probe). That cause sits in front
of the Windows ACL assurance, so this measurement can neither confirm nor refute that the helper removes the
`private-state-object-unsafe` refusals in this suite. Helper's own test: 5 pass, 1 skip (`helper-green.log`).

Observed on Claude x native Windows x own repository only; logs are ignored scratch artifacts
(`scratch/TMPDACL/codex-before.log`, `codex-after.log`, `helper-red.log`, `helper-green.log`).
