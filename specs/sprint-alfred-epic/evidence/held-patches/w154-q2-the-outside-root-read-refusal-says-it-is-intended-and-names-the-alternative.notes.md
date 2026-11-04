# w154 — the outside-root read refusal says it is intended and names the alternative (candidate 19, Q2 first half)

Delta on w153 (it adds a pin to the test file w153 extended). Elephant-built, in a clone that carries the whole chain through w153.

## Why

Antigravity Q2: a `grep` outside the repository was refused with a code that reads as unsafe. The refusal is intended (shell reads stay inside the project root); the text said what to re-target but not that it is deliberate, and named no alternative for a file that really lies outside.

## What it changes

- `lib/guard/grammar-denials.mjs`: a fourth line in `READ_SCOPE_DENIAL_REMEDY`: the refusal is intended, not a fault of the command; for one exact file outside the root the native Read tool is the alternative and applies its own read-scope rules. No claim that the native tool will admit it.
- `lib/read-command-diagnosis.test.mjs`: RCD12 submits `grep -n needle /etc/hostname` through the real guard (still exit 2, typed code, new sentences present).

## Checks

- Clone: `read-command-diagnosis.test.mjs` 12/12; `diagnostic-toil-cross-runner`, `no-route-denials-seed-no-override-request` and `g23-read-help` 18/18. No test pinned the old remedy lines by text (searched). `guard-lifecycle-ready.test.mjs`: 430 tests, 427 pass, 0 fail, 3 skipped. `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- The other half of Q2 (`ls -la` on `.git/agent-pipeline`, protected control root) is NOT built: the probe in a clone did not reproduce the refusal (the directory does not exist there and `ls -la` of an ordinary directory is admitted), so the wording for that case cannot be pinned yet. It needs a repro in a real governed project.
- No Full Verify; no independent Critic review (suspended by the PO).
