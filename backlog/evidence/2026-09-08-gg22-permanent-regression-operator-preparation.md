# GG22 permanent-regression operator preparation

This is preparation only. The protected target
`plugins/pipeline-core/hooks/guard-git.test.mjs` remains unchanged, the
backlog item remains open, and no permanent regression test has landed.

The prepared operator step is `guard-git-22-pathspec`. It proposes exactly
seven additive cases, taking the observed suite count from 232 to 239:

1. allowed ledger pathspec with an unrelated staged source file;
2. disallowed source pathspec;
3. bare staged-index commit;
4. `-i` widening;
5. `--include` widening;
6. `../` traversal; and
7. trailing-slash `backlog/items/` pathspec.

Preparation evidence:

- `scratch/NVA-B-GG22-PERMANENT-PREP-1/dry-check.txt`: exact `--check`
  command, exit 0, one anchored insertion and 232 → 239 count.
- `scratch/NVA-B-GG22-PERMANENT-PREP-1/preview-green.txt`: exact
  `--preview` command, exit 0, 239/239 cases passed from a removed sibling.
- `scratch/NVA-B-GG22-PERMANENT-PREP-1/historical-sensitivity.txt`:
  scratch-only copied pre-`fe2d7afe` guard failed the narrowly pathspec'd
  ledger commit because it read the unrelated staged source file.
- `scratch/NVA-B-GG22-PERMANENT-PREP-1/protected-test-hash.md`: protected
  target hash is identical before and after preview.
- `scratch/NVA-B-GG22-PERMANENT-PREP-1/pathspec-step-contract-probe-final.txt`:
  complete insertion is idempotent; changed or duplicate bodies refuse; a
  preexisting sibling is preserved.
- `scratch/NVA-B-GG22-PERMANENT-PREP-1/final-preview-green.txt` and
  `protected-hash-{final,after-final-preview}.txt`: final preview exit 0,
  239/239, and matching protected-target hashes.

For the attended operator only:

```sh
node harness/scripts/apply-pending-protected-edits.mjs --only=guard-git-22-pathspec --check
node harness/scripts/apply-pending-protected-edits.mjs --only=guard-git-22-pathspec --preview
node harness/scripts/apply-pending-protected-edits.mjs --only=guard-git-22-pathspec
node --test plugins/pipeline-core/hooks/guard-git.test.mjs
```

The first command does not write. The preview command creates one exclusive
temporary sibling, runs it, and removes only the sibling it created; it
preserves the protected target and any preexisting sibling. The third command
is the attended apply action and is intentionally not run in this dispatch.
Do not omit `--only=guard-git-22-pathspec`; do not run the applier's
all-steps mode. The operator should review the resulting protected-test diff
and commit it only after the final suite passes.
