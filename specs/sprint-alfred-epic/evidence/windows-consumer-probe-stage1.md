# Windows consumer probe, stage 1 (read-only baseline), candidate 19

Purpose: measure on a native Windows consumer which of the open Windows items (E1, E2, E4, E7, Q10) show up today, with the installed plugin and nothing else. The identical commands run a second time after candidate 19c is installed; the difference between the two outputs is the evidence. Baseline anchor: plugin version `0.7.0+claude.20261104062201.95d3e81`, source commit `95d3e8145` (every script named below exists at that commit).

Rules for the session that runs it:
- Run every command from the consumer project's own root, one simple command per tool call, nothing composed.
- Read-only: no heal, no apply, no release-lock, no move-aside, no dispatch, no commit. Stop and report instead if a step seems to need one.
- No human override, no read of the plugin source folder, no `.git` internals by hand (the guards refuse them; do not ask again).
- Paste every output verbatim, relative paths only; replace the user name and the absolute project path with `<user>` and `<root>` and say so.

Commands (`$PLUGIN` = the plugin root the session already knows as `PIPELINE_PLUGIN_ROOT`):

| Step | Item | Command | What to report |
|---|---|---|---|
| W1 | baseline | `node "$PLUGIN/scripts/pipeline-start-preflight.mjs"` | the whole JSON line: `status`, `pluginRoot` class, `nextAction`, every `windows-authority` cause with its `path` field if present |
| W2 | E2, Q10 | `node "$PLUGIN/scripts/session-authority-repair.mjs" inspect --root "<root>"` | the whole output: registry entries, lock holders with process id and age, `dead-anchor` or `unknown-registry-entry` markers, any `WIN-AUTH-*` code and whether the message names a path |
| W3 | E2 | for each lock-holder process id printed by W2: `Get-Process -Id <pid>` in PowerShell | alive or not found, and the process name (this separates a stale lock from a lock whose process status is unknown on Windows) |
| W4 | E1 | `node "$PLUGIN/scripts/goldfish-host-commit-recover.mjs" plan --root "<root>"` | the whole output: pending host-commit state, the dispatch ids it names, or the typed reason it has none |
| W5 | E7 | the eight commands below, each once in the Bash tool (Git Bash) and once in the PowerShell tool: `node --version`, `git --version`, `git status --short`, `git log --oneline -n 3`, `git diff --stat`, `git branch --show-current`, `git ls-files --error-unmatch README.md`, `git rev-parse --short HEAD` | a table: command, Bash outcome (ran or the refusal code), PowerShell outcome (ran or the refusal code). Any command that one shell allows and the other refuses is the E7 finding; quote the refusal text |
| W6 | Q10 | if any step printed `WIN-AUTH-OPEN`, repeat that step once and paste both outputs | whether the message names the path and offers a preview |

Not in stage 1 (a dispatch lands a commit in the consumer's real repository, so it needs the owner's explicit go): E1 live reproduction and E4 parallel dispatch. The E1 facts of the earlier real runs (11 background dispatches, 0 host commits, `NGHF-PENDING-UNAVAILABLE` 8 times) are already in the plan.

Reply to the session `Alfred Laptop` with the table and the verbatim outputs.
