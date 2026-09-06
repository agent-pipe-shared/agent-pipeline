# Neutral findings registry — NVA-B-GG22FIX-1

Source: T1 Critic review (opus, max; functional-equivalent-read-only), round
1 (partial — hunt category 7 not reached), of commits
`fe2d7afe4eed421df1dffdaa94a485c631447d06`,
`8c9b4906a6ad8e7d7fa5d924bd97ed4e3f2d7b27`, `2be23a13...` (ledger). Full
report: `scratch/dispatch/critic-fe54d448/` (report durability unavailable —
no Write tool, heredoc/redirect refused by the closed shell grammar; report
returned directly per CR-06-D's fallback clause).

**Verdict: pass/fail WITHHELD — partial review** (category 7, guardrails
text, not reached). F1 and F2 would in any case preclude a PASS.

- **F1** (major — admission-widening): the fix's new pathspec branch treats
  an explicit `--` pathspec as the WHOLE content of the commit. This is
  false for `git commit -i`/`--include`, whose real git semantics stage the
  named paths IN ADDITION TO whatever is already staged, then commit the
  entire staged set. A pathspec'd `-i` commit with an unrelated disallowed
  path already staged is admitted by the fix where the pre-fix code (full
  index check) would have refused it. Confirmed reachable by direct
  tokenization trace, no crafting beyond an ordinary documented git flag.
- **F2** (major — no test coverage): every committed `guard-git.test.mjs`
  GG22 case uses a bare `git commit -m "..."` with no `--`. The new
  pathspec-detection branch (`separatorIndex`/`explicitPathspec` logic) is
  never exercised by any committed test; the reported 232/232 is the
  unchanged pre-fix count, proving only that the untouched fallback branch
  still works.
- **F3** (minor — `../` traversal): the disallowed-path filter is a literal
  string-prefix test against an unnormalized pathspec token; a token shaped
  `backlog/items/../../src/x.js` satisfies the `backlog/items/` prefix
  check and is admitted, while git would resolve it outside `backlog/`.
  Requires deliberate crafting; outside the guard's own stated
  agent-adversary threat model, but is a real gap in the new code's own
  correctness.
- **F4** (minor — tokenizer used outside its documented contract):
  `tokenizeArgv` (`plugins/pipeline-core/lib/git-cmd.mjs`) is documented as
  tokenizing ONE command segment, with the caller responsible for isolating
  that segment first from a chained command. The fix calls it against the
  whole raw, unsplit command string. For a chained command, the first `--`
  anywhere in the string (potentially in an unrelated segment) is taken as
  the commit's own pathspec. Fail-closed direction (produces a false
  block), not fail-open, and chains are barred in this repo's own guard
  grammar — but the plugin ships to consumer projects that may not share
  that restriction.
- **F5** (minor — non-durable evidence citation): the closure note (commit
  `8c9b4906`) cites its RED/GREEN reproduction evidence at
  `scratch/gg22-pathspec-repro.mjs` and `evidence/NVA-B-GG22FIX-1-gg22-pathspec-{red,green}.txt`
  — both gitignored paths, unverifiable by any reader without the exact
  originating machine's local state. The durable, tracked artifacts that
  do exist (`backlog/evidence/2026-09-06-nva-b-gg22fix-1-{diff,green}.txt`)
  were not cited in the closure note.

**Not reached by round 1:** hunt category 7 in full (`guardrails/git.md`,
`guardrails/global.md`, the project calibration file).

## Correction: `NVA-B-GG22FIX-2` (commits `c6ef3425`, `316e16af`, `23672a96`)

Fixed F1 (allowlist of message/authorship/signing-only flags proven
exclusive from `git-commit(1)`; anything else, including `-i`/`--include`/
`-a`/`--all`/`-p`/`--patch`/`--amend`, falls through to the full index
check) and F3 (lexical `../` normalization, no filesystem access). F5
(non-durable citation) addressed with an additive note pointing at the
durable, tracked evidence.

## Round 2 (closing round, opus/max): FAIL — one new finding (F1'), reached category 7 for the first time

- **F1'** (major): `guardrails/git.md` GIT-09's own text still described
  GG-22 as unconditionally inspecting the whole staged index — stale
  relative to the just-landed pathspec-scoping behavior, and the exact
  "ruleset claims more than the guard enforces" failure GIT-07 forbids.
  Fixed directly by the Elephant (commit `1e3054a6`): GIT-09's second
  bullet now describes the current allowlist-based behavior.
- **F2** (minor, fail-closed): the new `normalizePathspecLexically()`
  drops empty path segments, so a trailing-slash directory pathspec
  (`backlog/items/`) now fails the `backlog/items/` prefix check and is
  over-blocked. Not a security regression (fail-closed direction only).
  Tracked:
  `2026-09-06-gg22-pathspec-normalization-false-blocks-a-trailing-slash-directory-pathspec.md`.
- **F3** (minor): round 2's own RED/GREEN evidence recurred the same
  non-durable-citation shape F5 already named for round 1 (the
  `scratch/gg22fix-2-repro.mjs` harness itself is gitignored). Noted in
  the existing test-coverage item rather than a new one.

**Two-round cap exhausted for this package.** The Elephant self-verified
F1' directly (doc-contract check clean, consumer-safe-paths 9/9,
guard-git.test.mjs unaffected at 232/232, vendored copy regenerated) — no
third Critic round. F2 and F3 are non-blocking, tracked separately.
**Package closed.**
