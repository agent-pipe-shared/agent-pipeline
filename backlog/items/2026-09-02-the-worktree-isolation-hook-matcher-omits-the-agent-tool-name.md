---
schema: pipeline.backlog-item.v1
id: pipeline.worktree-isolation-hook-matcher-omits-the-agent-tool-name
type: defect
owner: pipeline
status: open
created: 2026-09-02
sprint: nova-b
tracking: "Nova B — the worktree-isolation count check registers its baseline on the dispatch call itself, but its hooks.json matcher names Task and not Agent. guard-dispatch.mjs's own stanza names both and says in those words that naming the wrong tool is a silent no-op."
source: "Elephant, 2026-09-02, while supplying the live-run observation that pipeline.workflow-tool-isolation-worktree-never-created-a-worktree-this-session is blocked on. hooks.json is TP-4 protected, so this is filed rather than fixed in session."
done_when: manual
---

# The worktree-isolation hook's matcher omits the `Agent` tool name

## What happens

`plugins/pipeline-core/lib/worktree-count-check.mjs` registers its pre-launch
baseline on the PreToolUse event **for the dispatch tool itself** — its own
docstring says so: *"Call on a PreToolUse event for the dispatch tool itself
(Task|Agent|Workflow)."* If the hook does not fire on that call, no baseline is
written and the whole check has nothing to resolve against later.

The registration in `plugins/pipeline-core/hooks/hooks.json` (the
`guard-worktree-isolation.mjs` stanza) carries:

```
"matcher": "Bash|Edit|Glob|Grep|NotebookEdit|Read|Task|TodoWrite|WebFetch|WebSearch|Write|Workflow"
```

`Task` is present; **`Agent` is not**.

## Why this is a defect and not a preference

The same file already answers this question, one stanza above, for
`guard-dispatch.mjs`:

```
"matcher": "Task|Agent|Workflow"
```

with the comment: *"Both tool names are matched deliberately (`Task` in Claude
Code, `Agent` elsewhere): a matcher naming the wrong tool is a SILENT no-op, the
exact failure class this file already paid for with NotebookEdit."*

So the repository has a documented standard for a dispatch-tool matcher — name
both — and this stanza does not meet it. The `guard-dispatch-budget.mjs` stanza
(`Bash|Edit|Glob|…|Task|…|Write`) omits `Agent` too, but harmlessly: it counts a
*subagent's* tool calls, and those are Bash/Read/Edit shapes the matcher does
cover. The worktree check is different in kind, because the one event it must
observe to function at all is the dispatch call.

## What was and was not measured

Measured, 2026-09-02: an `Agent`-tool dispatch carrying `isolation: "worktree"`
was launched, isolation WAS granted (two independent observations — a second
`git worktree list` entry, and the dispatch's own
`git rev-parse --show-toplevel` resolving inside `.claude/worktrees/`), and
`.git/agent-pipeline/worktree-count-checks/` came into existence at that moment.
Since `mkdirSync` in that module runs only inside the baseline writer, something
did register.

NOT measured, and deliberately not inferred: whether that registration came from
the `Agent` call itself (the runtime matching more loosely than the literal
alternation) or from some other matched call in the same window. Directory
mtimes cannot separate "registered then resolved" from "never registered", since
resolution deletes the record, and no probe can observe it either — a
dispatched subagent looking for the record found the directory already empty.

Whatever this runtime happens to do today, the stanza does not state the
intent the module requires, and a matcher that works by accident is the
"silent no-op" the neighbouring comment warns about.

## Related, and the reason this was looked at

`backlog/items/2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md`
is blocked on observing one live run. That item cannot close while this is
unresolved, and separately it cannot close on a *successful* run at all: the
hook is advisory and its only output on success is silence, which is
indistinguishable from the hook never having run. Both facts belong to that
item; this one is narrower and mechanical.

## Constraint

`plugins/pipeline-core/hooks/hooks.json` is TP-4 protected. Changing the matcher
needs a human-cleared `guard-human-override.mjs` ceremony in signature mode, the
same route commit `0859afe6` used to land this hook's registration in the first
place. It is a one-token change to the matcher string, which makes it a good
candidate to bundle with the next ceremony rather than to spend one on alone.
