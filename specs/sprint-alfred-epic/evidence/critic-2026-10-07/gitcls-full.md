# Critic — GITCLS full review (f1bdda611, 9bc217fe9)

Route claude-opus-5-5 (effort not observed), functional-equivalent-read-only. Complete. Verdict **PASS** (one minor).
Notes not persisted (the guard refused the `node -e` write as opaque interpreter code; the dynamic classifier probe was
refused for the same reason, so the review is static plus evidence). Trajectory consistent (427/427; records bind files).

## Findings

- GITCLS-D1 (minor): ruling-42 clauses implemented but unpinned — `env --split-string[=]`, `-iS`, `view`/`ex` through
  `-c`/`+`, `--cmd`/glued `-c<cmd>`, and the unparseable-payload fail-closed path (`lib/git-cmd.mjs` ~1057-1101; the GITCLS-T
  tables at `git-cmd.test.mjs` ~1284-1308 cover only `env -S` and `vim`/`vi`/`nvim` `-c`/`+`).

## Deliberately not flagged (surfaced for the dispatcher)

- `env -Sgit push origin main` — the `-S` string is `git`; env appends the trailing operands, so the combined command is a
  push and is not detected. Ruling 42(a) scopes re-tokenization to the string, so this is a ruling-scope residual.
- Recursion bounded (depth 8, linear in length); `exBangCommand` splits on the first `!` (broader, fail-closed);
  `vim -nc'!git push'` (cluster with attached payload) not parsed — outside the ruling; nested `bash -c` stays a marker.

## Dispatcher disposition (2026-10-08)

Ruling 48: GITCLS-D1 gets pins (GITCLS-T2), and ruling 42(a) is widened: the `-S` string is classified together with the
operands that follow it on the `env` command line (as `env` runs them), closing the `env -Sgit push …` residual. One
fix slice, then self-verify. Not blocking the candidate.
