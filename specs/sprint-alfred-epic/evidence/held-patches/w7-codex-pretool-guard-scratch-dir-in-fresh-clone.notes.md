# codex-pretool-guard: the slow-push-guard case runs in a fresh clone (candidate 13, Elephant-built)

Built by the Elephant under the PO's small-items exception. The work happened in a throwaway clone of HEAD 032f467b2,
with the sixteen candidate-13 patches and the inventory rebaseline applied by the rehearsed apply script. The patch
changes one test file, `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`, and applies after R5.

## Cause

Case 7, "production adapter gives a slow push guard its dedicated share", added in 7502188da, is red under every
runner in this repository: `scripts/run-parallel.mjs`, `scripts/full-verify.mjs` and the slice drivers. It is also red
on plain HEAD. It has two independent environment assumptions:

1. `mkdtempSync(join(repoRoot, "scratch", ...))` needs `scratch/` to exist. A fresh clone has no `scratch/`, so the
   call fails with ENOENT. It passed only in a working checkout that already had one.
2. `assert.match(process.env.HOME, /codex-push-test-home/)` demands that the test runner's own HOME be named that way.
   No runner, Verify registration or script in the repository sets such a HOME, so the case fails with "test runner
   must provide a synthetic HOME".

## Change

1. The case creates `scratch/` with `mkdirSync(..., { recursive: true })` before its `mkdtempSync`.
2. The HOME assertion keeps its intent, that the adapter children never run with the runner's real HOME, but checks
   the HOME those children actually get: `run()` spawns them with `readyLifecycleEnvByRoot.get(root)`. For each of the
   three roots the case uses, that is the fixture's own `codex-ready-hgo-home-*` directory, and the `os.userInfo`
   preload reads `process.env.HOME` in the child. This is stricter than before (three roots instead of one parent env)
   and no longer depends on the runner.

No other assertion, no production file and no other case changes.

## Evidence

- Before: red on plain HEAD (run-parallel worker at 3ef0a113a) and on the candidate. The first error was ENOENT on
  mkdtemp under `scratch/`; with `scratch/` present it was the synthetic-HOME assertion (log
  `scratch/agent-out/worker-logs/cpg1.log`).
- After: `node scripts/run-parallel.mjs 1 c13cpg --src <rehearse clone>` at a fresh worker clone without `scratch/`
  gives GREEN, 39 checks, exit 0.
- `git apply --check` exit 0 on the candidate.

## Note

The file was already past its accepted line ratchet before this change (1574 against 1452 on HEAD; backlog item
`2026-10-30-pre-existing-reds-hide-new-cases`, item 6). This patch adds four lines to it.
