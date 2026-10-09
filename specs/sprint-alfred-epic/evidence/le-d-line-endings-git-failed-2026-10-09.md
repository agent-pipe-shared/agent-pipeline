# LE-D: `LINE-ENDINGS-GIT-FAILED` in the onboarding-init intake case (2026-10-09)

Read-only diagnosis. No repository file was edited. Evidence: `evidence/LE-D-20261009/driver-wsl.txt`
(captured by `capture-evidence.mjs`, WSL, wrapped exit code 0, driver `scratch/dispatch-wip/LE-D/driver.mjs`).

## Failing command

- Case: `plugins/pipeline-core/scripts/onboarding-init.test.mjs:455`, failing at `:519` (`intake-generate-apply`).
- Chain: `applyOnboardingIntakeGenerate` (`plugins/pipeline-core/lib/onboarding-continuity.mjs:7035-7043`) calls
  `planBoundDesignLineEndings` (`plugins/pipeline-core/lib/bound-design-line-endings.mjs:109`). Its first git call,
  `git rev-parse --show-toplevel` at `bound-design-line-endings.mjs:115`, exits non-zero; `git()` at `:22` turns that into
  `LINE-ENDINGS-GIT-FAILED`, and `onboarding-continuity.mjs:7042` re-labels it `INTAKE-GENERATE-LINE-ENDINGS-REFUSED`
  with the stderr dropped (`detail` is not copied into the message).
- Fixture directory: the case's `root` (`freshRoot()` under the OS temp dir), where `.git` is an EMPTY directory
  (`mkdirSync(join(root, ".git"))` then `chmodSync(..., 0o555)`, test lines 459-462) to model a host-managed repository.
- argv: `git rev-parse --show-toplevel` (cwd = root, `GIT_*` env stripped). Exit 128. stderr:
  `fatal: not a git repository (or any parent up to mount point /)` /
  `Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).` (git 2.53.0 under WSL).
  `git rev-parse --is-inside-work-tree` fails identically. Reproduced with the exported function alone:
  `plan: {"ok":false,"code":"LINE-ENDINGS-GIT-FAILED","exitCode":128,...}`.

## Cause

The fixture's `.git` is not a repository (git ignores an empty `.git` directory and walks up; nothing above the
temp dir is a repo). The CLI path of `intake-generate-apply` has no seam to inject `prepareBoundDesignLineEndings`
(`onboarding-continuity.mjs:7032-7034`: "The CLI has no flag or environment route to this seam"), so a real repo-local
`git config` write is mandatory. The case also asserts `readdirSync(join(root, ".git"))` is still `[]` (test line 522),
which contradicts that requirement by construction: preparing line endings needs a real repository and writes
`.git/config`.

## Was it ever green?

Not measured (budget). Evidence from history only: the line-ending preparation call was introduced in `1bd1d7bf6`
(`git log -S prepareBoundDesignLineEndings`), the CLI-level `intake-generate-apply` steps in this case in `e2713f8c7`.
So the case was written before the requirement; whether it was green between them or reddened by `1bd1d7bf6` needs
`git stash`-free verification in a clean worktree at `1bd1d7bf6^` and `1bd1d7bf6` (not done here).

## Classification

Test/fixture defect, with one product design question. Environment ruled out: the failure is platform independent
(an empty `.git` is not a repository for any git version); the WSL-only symptom is probably because Windows
`chmod 0o555` is a no-op and the Windows run is not known to differ either (not measured).
Product question for the PO/Elephant: should a `host-managed` repository capability skip the repo-local
`core.autocrlf` write (it explicitly must not touch `.git`)? If yes, that is a product change; if no, the fixture is wrong.

## Proposed smallest slice

Fixture-only (preferred, no product change): in this case, run `git init` before the `generate` steps does not fit
the `.git`-stays-empty assertions, so instead split the case: keep the language/question assertions on the host-managed
root, and move `intake-generate-plan/apply` to a second case on a real `git init` root, dropping the `.git` empty
assertion there. Product alternative: skip line-ending preparation when `repositoryCapability === "host-managed"`
(`onboarding-continuity.mjs:7028-7043`) and pin it with a unit test. Also cheap and independent: include
`lineEndingApplied.detail` in the `INTAKE-GENERATE-LINE-ENDINGS-REFUSED` message so the next failure shows git's stderr.
Slice TR-S1-T3f owns edits to `onboarding-init.test.mjs`; coordinate before touching it.
