# w130 — D7: the refusals name the accepted form

Found by the Antigravity run (priority 7) and the Codex run (P2): repeated GIT-03 trailer refusals and an absolute node path refused by `GUARD-DEVPLAN-SHELL`. The refusal texts named the rule but not the working form, so each one cost another attempt (the same pattern C18-8 fixed for other refusals: one working example per refused shape).

Change:
- `hooks/guard-git.mjs`: when the blocking GIT-03 findings include a marker or dispatch finding, the refusal adds one line: end the message with a blank line and exactly `AI-Assisted: true` and one `Dispatch:` line (`Dispatch: <task-id> (goldfish)` for a dispatched Goldfish, `Dispatch: stage-0 (elephant)` for an Elephant commit of your own), nothing else identifying provider, model or session. The existing lines are unchanged.
- `lib/guard/devplan-shell-lane.mjs`: a refusal in the `opaque-script-execution` lane whose command starts with an absolute path to node gets one more line: use the bare `node`; `node scratch/<name>.mjs` is the admitted draft-phase shape. Any other refusal keeps its text.

Tests (no case added, so the case-completion policies are untouched): the GIT03-6 case of `guard-git.test.mjs` also asserts the accepted-form line; the control cases of `devplan-shell-lane-recovery.test.mjs` also assert the bare-node hint (all of them use an absolute executable). `guard-git.test.mjs`, `devplan-shell-lane-recovery.test.mjs` and `guard-lifecycle-ready.test.mjs` are green in the clone, one at a time.

Not changed: the refusal logic itself, the admitted trailer values, the Dispatch grammar. Not proven: no real agent refusal showed the new lines; `Dispatch: design (elephant)` is also admitted but not named in the hint (two examples are enough).
