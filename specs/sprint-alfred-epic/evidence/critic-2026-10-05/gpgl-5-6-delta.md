# Critic record — GPGL-5/6 delta (push classifier correction)

- Review object (enumerated): `6ca4474d3` (GPGL-5), `fa5679263` (GPGL-6)
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 20 of 24 review tool uses (6 spent on guard refusals, 1 on a runaway scratch-name command, see below)
- Notes persistence: unavailable (no write tool; known gap `backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`). This file is the Elephant's record of the returned report.
- **Verdict: FAIL** (Finding 1, blocker)

Command examples below write a Windows drive-letter path as `<drive>:\repo\` (the evidence guard refuses literal drive paths).

## Findings

### F1 — blocker: PowerShell-executed pushes bypass the push gate

`6ca4474d3` replaced the backslash-blind tokenizer and the escaped-quote backstop (old check #3) with a scanner whose
two readings (POSIX, Windows path) both treat `\<space>` and `\"` inside double quotes as escapes. `guard-push` feeds
raw PowerShell text to the classifier (`hooks.json:77` matcher `Bash|PowerShell`; `guard-push.mjs:322-338` strips only
the override prefix), and in PowerShell a backslash is literal. Two valid PowerShell pushes that the parent classified
as pushes now classify as not-a-push under both readings:

- (a) `git -C <drive>:\repo\ push origin main` — `\ ` escapes the space (`git-cmd.mjs:176-178`, `:321-322`), so the
  `-C` value swallows `push`; `directPush` (`:571-574`) false; option collapse (`:233`) also misses it.
- (b) `echo "x\"; git push origin main; echo \"y"` — `readDoubleQuoted` (`:113-118`) makes one quoted span, blanked
  (`:200`); `escapedQuoteOutsideQuotes` (`:174`) only set for unquoted backslashes, so check #3 (`:519-522`) is silent.
  Parent evidence: `scratch/GPGL-5/red.log:139-140` (similar shapes returned true at the parent; `GPGL5_NEGATIVE_TABLE`
  now pins them false).

Risk: Claude PowerShell tool exits at `guard-push.mjs:351` fast path; Codex `codex-pretool-guard.mjs:373` drops
guard-push for PowerShell-rule text (Codex Windows shell not verified). `git-cmd.mjs:494-495` documents PowerShell as
"NOT covered" without owner/expiry (QG-06). Static derivation; not executed (node outside the Critic's grammar).

Spec-ref: escquote item Description/Proposal ("Fail closed"); `git-cmd.mjs:507-509` own contract; `guardrails/security.md:55`.

### F2 — minor: UNC paths lose a backslash in the exported tokenizer

`\\` hits the structural branch (`git-cmd.mjs:70`, `:176-178`) before the path branch (`:179-181`), so `tokenizeArgv`
(`:330-331`) collapses a leading double backslash of an unquoted UNC path to one. `guard-push` takes the target from
that token (`guard-push.mjs:407-415`, `:445-451`). Untested, noted as open in the `fa5679263` message. Usually fails
closed (unresolvable), but binds a different directory if one exists at the collapsed path.

### F3 — minor: GPGL-5 dispatch record covers none of `6ca4474d3`'s files

`scratch/dispatch/stripped-GPGL-5.json` has empty `commits` and no `report.changedFiles` (record ended blocked with
`changedFiles` at top level). Authorship of `6ca4474d3` rests on the trailer and the orchestrator's statement; same
pattern as registry F2.

## Deliberately not flagged (summary)

POSIX-lane F1 resolved; GL-B13/B17/B18 pinned; gitleaks detect allowed; scope limited to `git-cmd.mjs`, its test and
the gitleaks-prefix test; test changes additive except one GPGL5-TOKENIZE expectation (now literal `p\ush`, classifier
still flags it); POSIX edge cases (lone trailing backslash, continuation, ANSI-C, `g\it`, glued operators, Unicode
whitespace, trailing `\"`) fail closed or are correct; Windows `-C` targets restored (guard-push FAIL set equals the
pre-GPGL-5 baseline PG26a, PG-CHECKPOINT, PG-CHECKPOINT-WORKTREE); `git-cmd.mjs` stays pure; no new dependencies;
English; trailers GIT-03 clean. Not examined: `guard-git.mjs` (also imports `stripQuotedSegments`).

## Trajectory

Consistent: git-cmd red/green 121/140 → 140/140 (GPGL-5), 145/149 → 149/149 (GPGL-6); gitleaks-prefix exit 0 both;
guard-push 176/179 → 170/179 → 176/179 with the same 3 baseline FAILs. Not verifiable: the record cross-check for
`6ca4474d3` (F3).

## Briefing violations

None. Disclosures: the `fa5679263` message carries a note addressed to the Critic (treated as an artifact claim);
pre-existing `scratch/dispatch` and `scratch/GPGL-5/` content seen by name only.

## Operational incident

To draw a random scratch-directory suffix the Critic ran a `sed` read of `/dev/urandom` in the background; it never
terminated and the Critic's grammar admits no kill. The Elephant stopped it (TaskStop). Filed as a backlog item.
