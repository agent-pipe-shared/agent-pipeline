---
schema: pipeline.backlog-item.v1
id: pipeline.agent-dispatch-pretooluse-step-takes-minutes-in-a-consumer
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "PO paste of a consumer session (Windows terminal), 2026-10-26: the Agent call shows 'running PreToolUse hooks 3/4 · 4m 40s'"
done_when: manual
---

# One of the four PreToolUse hooks on an Agent dispatch takes minutes in a consumer repository

Four hooks fire on an `Agent` call: `guard-dispatch`, `guard-dispatch-budget`, `guard-worktree-isolation` and
`guard-slicing` (matchers in `hooks/hooks.json`; each declares a 10 s or longer budget and is meant to finish in well
under it). A consumer session showed the dispatch at step 3 of 4 after 4 m 40 s.

Measured on the WSL PC (this repository, 70 legacy dispatch records, installed hotfix candidate), 2026-10-26, with
`scripts/time-agent-hooks.mjs`: with a real generated briefing plus one byte, `guard-dispatch` 3.2 s (refusal after its
full parse), the other three 0.25 to 0.28 s each; about 4 s in total. The slow step is therefore not reproducible here.

Hypotheses, none confirmed, ordered by what the code shows: (1) `guard-dispatch-budget` waits on its counter lock
(`counter-lock-timeout`, holder age) when a previous process left the lock behind, which the Windows Ctrl+C finding
makes plausible (D165 W3); (2) the two `git` spawns (`rev-parse --git-common-dir`, `worktree list`) are slow on a large
Windows repository or under antivirus scanning, and four cold `node` starts add up; (3) a hook is waiting on stdin or a
network-backed path. The step numbering of the UI (3/4) does not say which hook is third.

Wanted: run `node scripts/time-agent-hooks.mjs <plugin-root> <generated-briefing.md>` once in the slow consumer
repository and record the four numbers. If one hook dominates, fix it (a bounded lock wait that reports itself, a
cached git probe); in any case each of the four should print a one-line timing diagnostic when it exceeds 2 s.
