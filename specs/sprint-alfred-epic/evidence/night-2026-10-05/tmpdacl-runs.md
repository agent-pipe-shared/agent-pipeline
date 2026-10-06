# TMPDACL — Codex pretool suite before/after (native Windows) — reverted

**Status:** the TMPDACL change (`34f6ea0c7`) was reverted after its Critic round
(`../critic-2026-10-05/tmpdacl.md`): it is a fixture-only workaround of the class
`../verify-2026-10-05/winacl-diagnosis.md` (Fix proposal, fourth sentence) does not recommend, its helper header
misattributed the root cause, and the measurement below shows no effect on the target suite. The production fix the
diagnosis prescribes is `b54b108d9` (hardened private directories in the hook installers). This file keeps the
measurement.

Change that was measured: `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` took `tmpdir` from a helper
`plugins/pipeline-core/lib/test-support/private-tmp.mjs` (a hardened, process-private temp root) instead of `node:os`.

| Run | Tree | Command | exitCode | Duration | Failing numbered cases |
|---|---|---|---|---|---|
| before | `git archive` export of HEAD at the time (scratch copy) | `node --test --test-timeout=120000 plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` via `capture-evidence.mjs` | 1 | 2907 s | 1, 6, 7, 8, 10, 11, 13–20, 22–32, 35–37 (28) |
| after | working tree with the helper and the import swap | same | 1 | 2865 s | 6, 7, 8, 10, 11, 13–20, 22–32, 35–37 (27) |

(Counts corrected from 31/30 to 28/27 per the Critic's recount of the logs; the earlier figures were wrong.)

Result: no case that passed before failed after. Case 1 ("Codex manifest matches the repository version and has a
native hook descriptor") failed only in the export run; likeliest cause is the export's manifest/version context — not
investigated. The first failure in the before log is an assertion in `createReadyLifecycleFixture`
(`codex-pretool-guard.test.mjs:288`) reading `'command'` where `'architecture-design-required'` was expected (the
fresh-clone `bootstrap-binding-required` state, family A of the fresh-clone probe). No ACL-assurance string
(`private-state-object-unsafe`, `PB-WINDOWS-ASSURANCE`) appears in either log, so the premise that this suite fails on
the OS temp root's ACL was not observed in these runs.

Observed on Claude x native Windows x own repository only; logs are ignored scratch artifacts
(`scratch/TMPDACL/codex-before.log`, `codex-after.log`, `helper-red.log`, `helper-green.log`).
