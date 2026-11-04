# Windows consumer probe, stage 2 (live dispatches on a throwaway branch), candidate 19

PO decision 2026-11-04: yes, on a throwaway branch. Purpose: separate the two E1 hypotheses (the pending host-commit state is never written on Windows, or it is written but cannot be read at the stop) and show what a second parallel dispatch does (E4). Baseline anchor: installed plugin `0.7.0+claude.20261104062201.95d3e81`. The same steps run again after 19c is installed.

Rules for the consumer session:
- All writes happen on one throwaway branch `pipeline-probe/stage2` created from the current HEAD; never on the main branch, never a push, no force, no hook skipping. Stop and report if a host commit would land anywhere else.
- The dispatch tasks are minimal and reversible: each adds one new file `docs/pipeline-probe-<n>.md` with one line of text on the throwaway branch, nothing else.
- Dispatch through the pipeline's own dispatch path (the generated briefing from the template, a `pipeline-core:goldfish-*` agent type, `run_in_background: true`); never a hand-written briefing.
- One simple command per tool call, no override, no read of the plugin source folder, no `.git` internals by hand. Paste every output verbatim, relative paths only, `<root>` and `<user>` replacing the project path and user name.
- Finish by switching back to the original branch; delete the throwaway branch only if the guards allow it, otherwise report its name and leave it.

Steps:

| Step | Item | What to do | What to report |
|---|---|---|---|
| S0 | baseline | `git branch --show-current`, then create `pipeline-probe/stage2` from HEAD and switch to it | the original branch name and the HEAD short hash before and after |
| S1 | E1 | one background Goldfish dispatch for `docs/pipeline-probe-1.md`. Before the launch run `node "$PLUGIN/scripts/goldfish-host-commit-recover.mjs" plan --root "<root>"` | the whole PreToolUse output at the launch (any WARNING and the preparation code it names), the launch result, and the plan output |
| S2 | E1 | immediately after the launch, before the subagent stops: `node "$PLUGIN/scripts/goldfish-host-commit-recover.mjs" plan --root "<root>"` again, and `node "$PLUGIN/scripts/session-authority-repair.mjs" inspect --root "<root>"` | the whole outputs; whether a pending host-commit state exists for the dispatch id and the `native-goldfish` producer's `inFlight` count |
| S3 | E1 | when the subagent has stopped: the whole hook output of the stop (SubagentStop and the PostToolUse return), then `git log --oneline -n 3` and the plan command once more | the stop result code (`awaiting-subagent-stop`, `NGHF-PENDING-UNAVAILABLE` or other) and whether a host commit exists; if the stop failed, the stop-failure record name and code |
| S4 | E4 | two background Goldfish dispatches started in the same turn, for `docs/pipeline-probe-2.md` and `docs/pipeline-probe-3.md` | the launch result of each, the verbatim refusal of the second launch if there is one (including any `WIN-AUTH-OPEN` and whether it names a path), and the `inspect` output right after |
| S5 | close | switch back to the original branch; delete the throwaway branch if allowed | the final `git branch --show-current` and whether the throwaway branch is gone or its name |

Reply to the session `Alfred Laptop` with the table and the verbatim outputs. If any step needs an action the guards refuse, stop at that step and report the refusal; do not ask for an override.
