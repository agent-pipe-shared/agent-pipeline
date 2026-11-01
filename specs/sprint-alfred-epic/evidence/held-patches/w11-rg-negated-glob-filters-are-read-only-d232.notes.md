# Held patch: negated rg glob filters are read-only (D232)

Built by the Elephant (PO exception for small fixes, held patch in a scratch clone, tree untouched) on `48eaf5693`. Item
`backlog/items/2026-11-01-negated-rg-glob-filter-is-refused-by-the-read-grammar.md`, decision D232 (PO instruction: "glob and ls are only reads, allow them").

## What was measured first

- `rg ... --glob '!*.patch'` (and `-g '!node_modules'`) is refused `GUARD-READ-COMMAND-UNSUPPORTED`: `isBoundedFilenameFilter` admits only
  `*.ext` and `*.test.ext`. This is the concrete refusal that hit this session.
- `ls -l`, `-h`, `-lh`, `-lah`, `-1`, `-a` on an admitted directory are ALREADY admitted in the source grammar: the names-only lane does not
  match them, but the generic read lane (`return args.every(isApprovedSingleCommandReadArg)`) takes any flag. Only a path outside the project
  root, a protected path or a missing operand is refused. Measured with `scratch/agent-out/w31gram/probe.mjs` on the unchanged tree and pinned in
  the changed test. A first draft widened the names-only lane; it was reverted because it changed nothing (and `ls -R` is admitted by the generic lane
  today, which the draft would have had to narrow). **No `ls` code changes.** Where the PO saw `ls` refused is open (tile): possibly the installed
  hook predates the source, a Windows PowerShell session (no `ls -lh` there), or the native Glob tool (AP9: hidden and escaping listings are refused).

## What changes

- `plugins/pipeline-core/hooks/guard-command-grammar.mjs` (protected kernel path), `isBoundedFilenameFilter`: positive filters unchanged; a filter
  starting with `!` is admitted when the rest is a bounded extension (`*.ext`, `*.a.ext`, `*.a.b.ext`, optional `**/` prefix) or a plain name
  (`node_modules`, `scratch/`). A negation only excludes: it cannot add a file the unfiltered search would not visit, cannot lift an ignore rule
  (only a positive glob overrides one) and cannot reach a hidden name (`!.*`, `!../x`, `!/abs`, `!a/b`, braces, `!`, `!*`, `!-x` stay refused).
  Applies to `-g` and `--glob`, to the single command, the `| head` pipeline and the Codex and Antigravity routes (one shared function).
- Tests: `lib/guard/g23-read-help.test.mjs` case 1 restated (QG-04, intent named in the test: a filter may only narrow; case count stays 3;
  `!*.md` moves from refused to admitted), now also pins the negated forms, the `ls` flags measured above and the full command lines.
  `lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs` AP3 restated the same way (`!*.md` moves to an admitted list with `!*.min.js` and
  `!node_modules`; `!.*`, `!../x`, `!*.{md,txt}` joined the refused list). `harness/scripts/check-verify-case-completion.test.mjs` VCR01 pin for
  `g23-read-help-tests` 14 -> 19 (top-level assertions; set here, once, because the Elephant owns the assembly).

## Evidence (targeted, in the scratch clone)

G23 read test 3/3; AP read pin 15 pass, 1 typed skip (host limitation); `read-command-diagnosis`, `g23-quoted-pipeline-reads`,
`diagnostic-toil-cross-runner`, `read-blocks-and-misleading-denial-texts-across-runners` green (67 tests, 1 failure before the AP3 restatement,
none after); VCR 32/32; kernel closure 11/11; guard split 6/6; `check-doc-contracts` valid. `git apply --check` on `48eaf5693` passes.
Not done: Full Verify, batch Critic, native Windows, a revert proof, the installed hook (refreshed only after the apply).

## Not changed, offered as a tile

Positive filters outside the closed extension grammar (`**/*.md`, `*.tar.gz`, `*.{md,txt}`, a plain directory name) stay refused: a positive glob
overrides ignore rules and can select hidden names, so it needs its own decision.
