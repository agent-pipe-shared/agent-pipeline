# w131 — a node script that names the Pipeline control-plane directory is refused by the shell guard (candidate 19, Q5)

Applies on top of the applied chain at 698419dcf (it adds a guard lane and one suite registration in `harness/verify-suites.json`). PO decision of 2026-11-03: block it now with a guard.
Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/guard/control-plane-script-scan.mjs`: when a Bash or PowerShell command runs a script through `node` (bare or absolute path) and the script path is a `.mjs`/`.js`/`.cjs` file inside the repository, the guard reads that file
  (regular file, at most 256 KiB, no symlink at the file or a parent) and refuses the command when the text names the control-plane directory: `.git/agent-pipeline` or `.git\agent-pipeline`, the literal pair `'.git', 'agent-pipeline'`
  (covers `join(`/`resolve(` calls), or a `gitDir`/`git-common-dir` expression combined with a quoted `agent-pipeline` literal.
- The refusal is typed `GUARD-CONTROLPLANE-SCRIPT`, names the script and the matched spelling, and says what to do: use the sanctioned Pipeline commands, or let a read-only script take the path from a command-line argument.
- Missing, oversized, symlinked or unreadable scripts are not claimed; scripts under `plugins/pipeline-core/` are exempt. The lane runs for every lifecycle state.
- `evaluate.mjs`: one call at the head of the shell-tool block, before the gate-strength lane (two lines plus the import). The command is split on `;`, `&`, `|` and newlines, so a script behind `cd x && node ...` is reached.
- `control-plane-script-scan.test.mjs` (plain node:test, 9 cases, written RED first: 5 refusal cases failed on the original code) and its entry in `harness/verify-suites.json`.

## Checks

- New suite: 9 of 9 pass in the clone.
- `guard-lifecycle-ready.test.mjs` and one neighbouring guard suite: see the dispatch report.
- `w131-...check.test.mjs`: the patch exists, applies to the real HEAD and touches only the four files.

## Not changed / not proven

- Known limit: another interpreter (python, bash), or a script that builds the path at run time, is not covered by a static scan; the real boundary needs host sandboxing. The rule is not widened to guess.
- Inline `node -e` code and scripts reached through `import` are not scanned; only the script file named on the command line.
- The capability inventory baseline may need its derived-files refresh for the new suite registration; not run here. The full Verify run was not made.
