# w204 — the unsupported-read refusal names the admitted spelling (Q2 control-root half, F9 rest; candidate 19c)

PO decision 2026-11-04 (evening): take Q2 and F9 on, drop the rest of EL-19 for now.

## What was wrong, measured

`ls -la .git/agent-pipeline` is refused in the main tree with `GUARD-READ-COMMAND-UNSUPPORTED` and the line `Rejected element: the flag "-la"`, while `ls -la docs` and plain `ls .git/agent-pipeline` are admitted. Cause (`isNamesOnlyLsArgs`, `lib/guard/shell-grammar.mjs`): a protected directory, the control root among them, is listed as names only (`-1`, `-a`, `-A`); metadata flags are not admitted there. The refusal named only the flag, and the generic text says the refusal is about spelling "not a path", so the flag alone read as an unsafe spelling and gave no way forward. That is the Q2 control-root half; it did not reproduce in a clone because a bare clone has no protected control root, which is why it was recorded as not reproducible (probe: `scratch/agent-out/lsprobe.mjs <tree> --code=<tree with the new code> <command>...` against the real repository root reproduces it).

F9: combined short flags (`rg -ln`, `rg -il`) are refused where the split spelling (`rg -l -n`) is admitted, and the refusal named the cluster without saying so.

## Change

`lib/read-command-diagnosis.mjs`:
- `lsListingHint(command, flag, root)`: for an `ls` command and a flag that is not one of the names-only flags, one sentence: a protected directory is listed as names only (`ls <dir>`, `ls -1 <dir>`, `ls -a <dir>`, `ls -A <dir>`), `find <dir> -maxdepth 1` lists the same names, this is an intended read limit.
- `clusterSpellingHint(command, flag, root)`: for a short-flag cluster `-xy`, the split spelling `-x -y`, printed only when the grammar itself admits the command with the split flags (the grammar stays the single authority; nothing is guessed).

`lib/guard/evaluate.mjs`: the `Rejected element` parenthesis prints the attached-value spelling hint first (unchanged), else the cluster hint, else the listing hint. Prose only; the refusal verdict, the code and the grammar are unchanged, nothing is granted.

## Why no pinned text had to be reworded

The coordinated test pass was not needed in the end: the new sentences are appended inside the existing parenthesis of the `Rejected element` line, which every pinned suite matches by prefix. The pinned suites are unchanged and green.

## Evidence (work clone on the rehearsed chain)

- `read-command-diagnosis.test.mjs` 17/17 (new RCD15 listing hint, RCD16 wiring pin, RCD17 cluster hint with the real refusal text; the wiring is a source pin because the control root is not protected in a bare checkout).
- Pinned-text neighbours: `g23-read-help`, `g23-quoted-pipeline-reads`, `g23-cross-runner-passive-matrix`, `read-blocks-and-misleading-denial-texts-across-runners` together with the diagnosis suite 57 pass, 0 fail, 1 skipped.
- `guard-lifecycle-ready.test.mjs` 427 pass, 0 fail, 3 skipped (same as before the change).
- Live probe of the new code against the real control root: `ls -la`, `ls -l` and `ls --color` print the listing hint, plain `ls` and `ls -1` stay admitted; `rg -ln` and `rg -il` print the split spelling; `grep -rn` prints nothing because no split spelling is admitted.

Not done: nothing here changes what an agent may read, so no widening needs review; the remaining wording of the generic "not a path" sentence in the unsupported-read text is untouched.
