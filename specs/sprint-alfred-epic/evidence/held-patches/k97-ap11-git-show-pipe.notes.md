# K97-AP11-GIT-SHOW-PIPE notes (clone k97, base: rehearsal bundle C15-C28)

Cause: the git-show object lane (`isContainedGitShowObject`, guard-command-grammar.mjs) required exactly `show <obj>`, and the generic
git-to-head lane (`areGitObjectSpecOperandsContained`, lib/guard/shell-grammar.mjs) required exactly ONE operand once an `<rev>:<path>`
operand is present. So `git show HEAD:<path> --format= -- | head -N` (PF-17) was refused as an unapproved operator. AP11 pins that refusal for
`extra` / `--stat`; those entries are untouched.

Change (decision row 15 "Widen the grammar", smallest reading):
- New exported `gitShowObjectOperand(operands)` in hooks/guard-command-grammar.mjs: operands after `show` = exactly one object operand, plus
  at most ONE `--format=` / `--format=<fmt>` token (before OR after the object; fmt = plain token `[A-Za-z0-9%._,:-]*`) and at most ONE trailing `--`.
  Anything else (second option, repeated format, `--` not last or doubled, quoted/space/`$`/backtick fmt, extra operand) returns null.
- `isContainedGitShowObject` and `areGitObjectSpecOperandsContained` both use it; revision/path screen (`isContainedGitObjectSpec`), sink
  (`| head -n 1..500` / `| head -1..500`), and every other lane rule are unchanged. No new module, no new import edge (shell-grammar already imports the grammar file).
- Consequences I did not narrow (same code path as before): `-C <repo>` (D114) and `| tail -N` (D114) admit the same widened source; the dedicated lane stays head-only.
- Advertised text sites: `rg` over agent-obligations.md, skills/pipeline-start/SKILL.md, docs/operating-tools.md, grammar-denials.mjs found no
  `git show` text wider than what is admitted (refusal text says generically "git <read-only-subcommand> ... | head"); no text change, no vendored-canon regeneration.
- Not decided by me: bare `head` without N stays refused (control `git log | head`).

Files: protected `scratch/agent-out/K97-AP11-GIT-SHOW-PIPE-k97-protected.diff` (hooks/guard-command-grammar.mjs +21, lib/guard/shell-grammar.mjs +/-6);
unprotected `scratch/agent-out/K97-AP11-GIT-SHOW-PIPE-k97-unprotected.diff` (lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs +85,
lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs +37 incl. new AP16). Both `git apply --check` clean against the main checkout
(they also stack on the bundle). The pin cases for the admitted forms are green only with the protected diff applied. The clone STILL CARRIES all four edits (uncommitted).
No assertion was weakened or removed (QG-04): only cases added.

Results (run alone, private TMPDIR via scratch/k97-run.mjs; before = identical code in clone k91, after = clone k97):
- RED first (new cases, unchanged grammar): advertised pin 227 tests, 214 pass, 13 fail (all "K97 admitted ..." assertion false!==true); windows pin AP16 1 fail.
- advertised-git-to-head pin: before 174/174 pass -> after 227/227 pass (53 new: 12 admitted + 1 admitted-with--C, 39 stays-refused + 1 refused-with--C), 0 skip 0 todo.
- claude-windows-guard-refuses-every-in-repo-read pin: before 15 tests, 14 pass, 1 skip (AP5 win32-only) -> after 16 tests, 15 pass, 1 skip.
- hooks/guard-lifecycle-ready.test.mjs: after 392 tests, 389 pass, 0 fail, 3 skip (654 s) = briefing baseline 392/389/3.
- hooks/guard-testpath.test.mjs: before 21/21 -> after 21/21.
- git-stash-list-classified-as-working-tree-write pin 88/88; hgo-patch-preflight-before-signature 14/14; read-option-operands 20/20;
  git-stash-readonly 34/34; guard-split-contract 5/5; shell-grammar-file-is-a-kernel-path pin 8/8; commit-grammar-hint pin 8 (7 pass, 1 skip; same before);
  harness/scripts/check-consumer-safe-paths.test.mjs 9/9. (There is no hooks/guard-command-grammar.test.mjs and no lib/guard/*grammar*.test.mjs.)
- Negative controls (all refused before AND after): `| grep y`, `| head -n 1000`, `| head -n 5 | cat`, `> f`, `git show $(...)`, `; rm y`, `git log | head`, plus more in the pin (stays-refused list).
- Deliberate mutation (local, reverted, no commit): (1) `objects.length === 1` -> `>= 1` made 11 "K97 stays refused" cases fail (--stat, extra operand, --output=,
  --textconv, doubled/misplaced `--`, repeated/bare --format, --pretty=); (2) format regex widened to `.*` made 2 fail (quoted fmt with space, backtick fmt). Controls are therefore live.
- Ratchet effect on architecture/boundary-policy.json: not run against the clone (no new module, +25 lines in two existing files); report only.

Risks: format token allowed chars include `%` and `:` (pretty-format placeholders, output only; git `--format=` cannot execute or write). Object read still goes through the
credential/root screen. Windows host behaviour of the dedicated lane is pinned by AP16 but was not run on win32.

Proposed commit message (operator applies protected parts; pins may be committed alongside):
feat(guard): admit git show <rev>:<path> with --format= and a trailing -- in the bounded head pipeline

Widen the git-show object lane per the PO tile decision (row 15, 2026-10-23): one optional plain --format=<fmt> and one trailing --
before the single `| head -n 1..500` sink. Every other pipe, option, expansion and redirect stays refused.

AI-Assisted: true
Dispatch: K97-AP11-GIT-SHOW-PIPE (goldfish)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
