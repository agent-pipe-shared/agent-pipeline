# W7-GATE-STRENGTH-FIND-READS (s4) -- notes (state: HELD, built by the Elephant in a scratch clone)

Applies AFTER `w7-report-05-find-or-root-and-collision-teaching` (same function, `find` in `lib/guard/shell-grammar.mjs`). Patch: `w7-gate-strength-find-not-path-reads-s4.patch` (2 paths; apply-checked in a fresh clone with the Report 05 patch applied first). Backlog item: `2026-10-26-gate-strength-shell-refuses-admitted-reads.md`.

## What was measured first

A probe ran the item's commands through the real lifecycle guard in a fresh git repository that holds a `pipeline.json` (baseline, no pending patch):

- `rg -n "\"project\"|\"handover\"" pipeline.json`, `rg -n project pipeline.json`, `cat`, `head`, `sha256sum`, `git log -- pipeline.json`, and `find . -maxdepth 2 -name "pipeline.json"`: admitted (exit 0). The `rg` read of the item is no longer refused on the current code.
- `find . -maxdepth 2 -name "pipeline.json" -not -path "./node_modules/*"`: refused with `GUARD-GATE-STRENGTH-SHELL`. Cause: the closed `find` predicate set had no `-not` and no `-path`, so the command was not a recognised read and fell into the gate-strength lane, which then refused it by the file name in its message that claims such reads are admitted.
- `echo x > pipeline.json` and `rm pipeline.json`: refused with `GUARD-GATE-STRENGTH-SHELL` (correct).

## What it changes

`find` in `isReadOnlySimpleWords` (`lib/guard/shell-grammar.mjs`) additionally admits `-path` and `-ipath` (one non-option pattern word, like `-name`), `-prune` (no argument) and `-not` (negates the next predicate only: it cannot repeat, precede an operator or end the expression). Everything else stays as it was, including `-delete`, `-exec`, `-ok`, `-fprint` and roots outside the project. Test: case FOR03 in `lib/guard/find-or-operator-read.test.mjs` (added by the Report 05 patch).

## Checks

- Stacked scratch clone (six pending patches plus these edits): `find-or-operator-read.test.mjs` 3 of 3 pass (FOR01 to FOR03). The probe now admits the `-not -path` command and still refuses the two writes.
- Other suites that read `shell-grammar.mjs` were not rerun with this change; the Report 05 patch's own neighbour suites (read-option-operands, diagnostic-toil, read-command-diagnosis, the read-only pins) passed before it.

## NOT in this patch

- The message text of `GUARD-GATE-STRENGTH-SHELL` is unchanged (it still names `cat`, `rg`, `head`, `sha256sum` and read-only `git`). Other `find` predicates (for example `-mtime`, `-size`, `-newer`) stay refused.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel path: the PO applies it in the same ceremony, right after the Report 05 patch.
