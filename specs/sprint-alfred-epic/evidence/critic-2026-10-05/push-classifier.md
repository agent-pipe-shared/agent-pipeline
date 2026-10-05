# Critic record: push classifier GPGL-2/3/4 (`6b0413700`)

Independent Critic, Opus 5.5 at max (route pre-check matched), ruleset `0.7.0+claude.20261005202045.7170ed20`,
candidate `6b0413700`. Lane: functional-equivalent read-only, OS isolation not asserted. The Critic could not
persist `critic-notes.md` (heredoc and `node -e` refused) nor run its probe; this file, written by the Elephant from
the returned report, is the durable copy.

**Verdict: FAIL** — one blocker, one major.

## F1 (blocker) — GPGL-4's push-word conjunct re-opens a quoting fail-open

GPGL-3 added fail-closed check #3 (escaped quote outside single quotes + `git` at an executable boundary). GPGL-4
added the raw-text conjunct `PUSH_WORD_ANYWHERE_RE` (`/\bpush\b/i`, `lib/git-cmd.mjs:308`, conjunct at `:437-441`).
A push word split by interior quotes defeats the raw test while the shell still pushes:

    echo \'; git pu"sh" origin main; echo \'

Static trace (`commandIsGitPush`, `git-cmd.mjs:433-498`): unterminated-quote check balances (backslash-unaware) →
check #3 misses (no contiguous `push`) → check #4 misses (`git` unquoted) → `stripQuotedSegments` (`:23`) blanks
`'…'` across the real command → `tokenizeArgv` (`:128-186`) swallows it into one token, token[0] `echo` → **false**.
The variant with `"git"` also returns false (the escaped-quote span blanks the quoted git token). Before GPGL-4 the
first form was caught by check #3. The commit's own record flagged the split form as "not measured"; the code
comment at `:421-423` documents it without owner or expiry (QG-06).

Reachability: on Claude the closed shell grammar refuses the `;` composition; the exposed route is **Codex**, where
`codex-pretool-guard.mjs:373` uses `commandIsGitPush` as its only prefilter (escquote item: "relies on the
classifier", not measured live on Codex). Rated blocker because Codex is a first-class matrix runner.

Probe for a less restricted session (read-only, prints OPEN/PUSH per string): import `lib/git-cmd.mjs` and call
`commandIsGitPush` on the two attack strings and the literal `git push` control.

## F2 (major) — commit attribution does not cover its own changed files

`6b0413700` (`Dispatch: GPGL-4 (goldfish)`, `Commit-Act: orchestrator`) creates
`hooks/guard-push-gitleaks-prefix.test.mjs` (+233), which the GPGL-4 record's `report.changedFiles` omits and its
report §4 lists as "deliberately not changed"; the commit bundles GPGL-2/3/4 under one ID.
`agent-obligations.md:166-170` → `dispatch-authorship-verify.mjs` would report UNVERIFIABLE.

## Cleared

GPGL-2 boundary rule (gitleaks forms admitted, literal-git forms still refused); scope (shared classifier only);
reachability (both guards consume it); test integrity (`git commit -m "say \"hi\""` moved to negative is a
legitimate false-positive fix); ANSI-C `$'…'`, double-quote escapes, Windows path endings, uppercase PUSH covered;
no secrets; no new dependencies; English.

## Trajectory

Consistent: red 105/109 → green 109/109, gitleaks-prefix 26/26, guard-push 176/179 with exactly PG26a,
PG-CHECKPOINT, PG-CHECKPOINT-WORKTREE red; the guard-push run was completed by the orchestrator before the commit.

## Elephant disposition

- F1 → fix slice GPGL-5 (deep): make the quote stripper and tokenizer backslash-aware per POSIX rules so escaped
  quotes no longer desynchronise them, classify on dequoted tokens (so `pu"sh"` reads `push`), and keep a
  fail-closed backstop for an escaped quote outside any quotes plus a git word at an executable boundary without a
  raw push-word requirement. The 06:45 checkpoint push is unaffected: it runs on the installed IC-2c guards, not on
  this branch's classifier.
- F2: same record gap as FANOUT-S7b (orchestrator integration did not reconcile `changedFiles` with the staged
  paths). History is not rewritten; from now on every diff-only integration compares the record's `changedFiles`
  with the staged paths before the commit act and names any difference in the commit body.
