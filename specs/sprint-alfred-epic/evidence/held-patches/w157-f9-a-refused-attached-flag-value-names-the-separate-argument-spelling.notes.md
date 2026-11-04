# w157 — a refused attached flag value names the separate-argument spelling (candidate 19, F9 rest)

Delta on w156 (it extends the files w153 changed). Elephant-built, in a clone that carries the whole chain.

## Why

Reproduced live in this session: `rg -n -A8 needle file` was refused with `Rejected element: the flag "-A8"` and no word on how to spell it. The grammar takes a numeric value as its own argument (`-A 8`) and refuses every attached form (`-A8`, `-m5`, `--max-count=5`). The agent had to guess.

## What it changes

- `lib/read-command-diagnosis.mjs`: `flagSpellingHint(flag)`: one sentence for `-A/-B/-C/-m` with an attached number and for `--flag=value`; null for any other flag. Prose only.
- `lib/guard/evaluate.mjs`: the `Rejected element:` line appends that sentence in parentheses when it applies.
- `lib/read-command-diagnosis.test.mjs`: RCD13 (the helper) and RCD14 (the printed refusal; the suggested spelling `rg -n -A 8 needle README.md` is asserted to be admitted by the grammar, the attached one refused).

## Checks

- Clone: `read-command-diagnosis.test.mjs` 14/14. `guard-lifecycle-ready.test.mjs`: 430 tests, 427 pass, 0 fail, 3 skipped. `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- No grammar change; nothing new is admitted. The `ls` and `-la` family and the Q2 control-root half are not part of this.
- No Full Verify; no independent Critic review (suspended by the PO).
