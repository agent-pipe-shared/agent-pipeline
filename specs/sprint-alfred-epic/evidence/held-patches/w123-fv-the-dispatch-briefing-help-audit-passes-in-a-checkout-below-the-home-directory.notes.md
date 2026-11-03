# w123 — the dispatch-briefing help audit passes in a checkout below the home directory (candidate 19)

Applies on the repository on its own (`git apply --check` exit 0). One hunk in `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs`.

## Why

The test "public --help and -h work before setup without private reads, processes or filesystem effects" runs the script with an audit that throws `HELP-FORBIDDEN-IO` for any filesystem call whose path starts with the working directory, with `HOME` or with `.git/agent-pipeline/`. In a checkout below the real home directory (the usual place, and every clone below it) the plugin's own source tree starts with `HOME`, so the module's own source reads were refused and the case failed: red whenever the file runs alone, green in the Full Verify only because it runs with a private HOME. The item was on the candidate 19 list ("HELP-FORBIDDEN-IO test below the home directory").

## What it changes

The audit's refusal gets one extra condition: a path inside the plugin's own root (two levels above the script) is not private state. The intent of the case is kept (help reads no project state, no home or machine state, no `.git/agent-pipeline` state, starts no process and asks for no identity); the stderr equality and the directory-snapshot equality assertions are untouched.

## Checks (slice clone below the main tree)

`dispatch-briefing.test.mjs` 157 of 157 with the change (154 of 155 without it, the one red being this case).

## Not proven

Full Verify run; the same file in a clone directly below the home directory was not run with this hunk (it is the same condition).
