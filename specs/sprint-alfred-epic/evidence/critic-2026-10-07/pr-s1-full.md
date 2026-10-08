# Critic — PR-S1 package, full review (fc2abd72e, cf9ed9f53)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Complete review (19 of 30). Verdict **FAIL**
(three majors, one minor). Trajectory consistent (RED at import → 38/38); QG-04/QG-07 held; scope and trailers clean.

## Findings (registry IDs)

- PR-F1 (major): `classifySimple` (`lib/gh-cmd.mjs:380-396`) takes the first non-assignment word as the command word and
  defaults to `none`; redirection tokens are not skipped and unlisted wrappers fall through: `2>/dev/null gh pr merge 1`,
  `>out.txt gh …`, `</dev/null gh …`, `&>/dev/null gh …`, `winpty gh …`, `strace -f gh …`, `flock /tmp/l gh …`,
  `op run -- gh …`, `coproc gh …`, `env -S 'gh pr merge 1'`, `git -c alias.x='!gh pr merge 1' x`, `vim -c '!gh …'` all
  classify `none`. Decision AN ("never silently allowed"); design note §2 (fail-closed marker rule).
- PR-F2 (major): `GH_REPO` / `GH_HOST` (prefix assignment, `env`, `export … &&`) are ignored; `classifyPrCreate`
  (:263-275) checks only `--repo`/`-R` and `owner:branch`, so a cross-repo or cross-host PR returns the admitted
  delivery. Design note §2 `DELIVERY-UNSUPPORTED-CROSS-REPO`.
- PR-F3 (major): slice 1 per the design note includes wiring into the push guard and the other `commandIsGitPush`
  callers; the package adds only the library (`gh-cmd.mjs:14-16` "NOT WIRED"), with the deferral untracked. QG-06.
- PR-F4 (minor): two deliveries in one compound command report only the first head/base (`moreSevere` :85, :419, :431).

## Dispatcher disposition (2026-10-08)

Ruling 28: (a) redirection tokens (`[0-9]*[<>]…`, `&>…`) are skipped when locating the command word; (b) fail-closed
marker rule: a segment whose command word is not `gh`, a transparent wrapper or an opaque runner, but whose text
contains a `gh` word (basename `gh`/`gh.exe`, case-insensitive) followed by `pr`, `api`, `release`, `repo` or `gist`, is
`unclassified` (refused), never `none`; (c) any `GH_REPO` or `GH_HOST` assignment in the command (prefix, `env`,
`export`) makes a delivery `DELIVERY-UNSUPPORTED-CROSS-REPO`; (d) more than one delivery action in one command is
`DELIVERY-PR-BINDING-INCOMPLETE`. The two shared git-classifier gaps (`env -S`, `vim -c '!…'`) are pinned for `gh` only;
the git side goes to a backlog item. PR-F3: the wiring touches protected guard files → tranche 2 of the signed
package, tracked as a backlog item with owner Elephant and due "before the 0.7.0 candidate is called complete"; the
cf9ed9f53 subject overstates the slice (history is not rewritten; this record corrects it). Sequencing: PR-S1-T2
(test-only), then PR-S1-F2; one delta Critic, then self-verify.
