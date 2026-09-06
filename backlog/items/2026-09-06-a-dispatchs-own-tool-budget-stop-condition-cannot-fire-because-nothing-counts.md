---
schema: pipeline.backlog-item.v1
id: pipeline.tool-budget-stop-condition-cannot-fire
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- every Goldfish briefing carries 'tool budget reached or clearly about to be exceeded' as a stop condition, but an agent has no counter to read: it must estimate its own tool-call count from memory of its own turn. Measured twice on 2026-09-06 in one session: both dispatches overran and neither stop condition fired. This is a sibling of the closed maxTurns-cliff item, not a duplicate -- that one was about the hard limit being unannounced, this one is about the soft limit being unobservable to the agent expected to honour it."
source: "Direct measurement, 2026-09-06: NVA-B-VERIFYLANE-2 used ~59-61 tool calls against a briefed 45+5 and reported the overrun only after an advisor consult flagged it retroactively; NVA-B-DENIALCODE-1 reached the harness turn limit at 80 against a briefed 40+5, losing its report entirely."
---

# A dispatch's own tool-budget stop condition cannot fire, because nothing counts the tool calls

## The gap

`templates/prompts/goldfish-task.md` field 5 asks every dispatch to stop when
its "tool budget reached or clearly about to be exceeded". The template is
honest that the budget is not hook-enforced. What follows from that, and is
not stated, is that the *stop condition itself* is unimplementable as written:
an agent has no counter to consult. Honouring it requires the agent to
maintain an accurate running count of its own tool calls across a long
context, from memory, while doing the actual work.

That is the one thing an agent in a long run is least able to do reliably. The
stop condition therefore reads as a real safeguard, is briefed as one, and is
load-bearing in the sense that dispatchers size budgets assuming it will fire
— but it has no mechanism.

## Measured, same session, two of two dispatches

| Task | Briefed | Actual | How it ended |
|---|---|---|---|
| `NVA-B-VERIFYLANE-2` | 45 + 5 | ~59–61 | Ran to completion; overrun noticed only when an advisor consult flagged it retroactively, and disclosed honestly in the report |
| `NVA-B-DENIALCODE-1` | 40 + 5 | 80 (harness cap) | Cut mid-run during evidence capture; report and record log lost entirely |

Two for two is not a sample, but it is the whole population of that session's
budgeted dispatches, and neither failure mode was the agent ignoring the rule
— in both cases the agent had no way to know it had crossed the line.

## Why it matters beyond tidiness

The second row is the expensive one. The budget exists to make a dispatch stop
*before* the harness cuts it off, because a self-stopped dispatch writes its
report and a harness-cut one does not. A stop condition that cannot fire
converts every mis-sized budget into data loss instead of a clean stop.

## CORRECTION 2026-09-06, same day: the premise above is wrong in an important way

This item was filed claiming nothing counts an agent's tool calls. **Something
does.** `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` exists, is
registered in `hooks/hooks.json` (hook 9), and was built for exactly this
problem — its own registration comment states the motivation verbatim: *"three
dispatches ran 62, 53 and 50 tool calls against a stated ~40-45 allowance, and
one reported '34 logged' while the runtime recorded 62."* It is designed to
count externally rather than trust the self-report, and to permit only closing
acts once the cap is reached, so a dispatch stops before the harness cliff at
the one point where a handover is still possible.

**It is not counting.** After four budgeted dispatches on 2026-09-06,
`<git-common-dir>/agent-pipeline/dispatch-budget/` contains only two
`orchestrator-seen/` marker files and **no per-dispatch counter of any kind**.
Every dispatch of the day was therefore either identified as the orchestrator,
left unresolved, or never reached by the hook.

That reframes the defect entirely, and makes it worse rather than better:

- The real question is not "should we build a counter" but **"why is the
  counter that exists silently not firing"** — the exact failure class this
  guard's own comment warns about twice, in its own words: *"a matcher the
  runtime does not recognise is a SILENT no-op that looks exactly like
  success."* That comment records this hook having already been registered
  once with a matcher that matched nothing while a live dispatch made 34 tool
  calls.
- A guard that was corrected once for silently matching nothing, and now
  again writes no counters, is a guard whose enforcement has never been
  confirmed live in this checkout.
- `docs/state.md` separately records that installed marketplace copies of at
  least two other guards are stale, so "wired in the repo" is not evidence of
  "enforcing in this session".

**Next step is diagnosis, not design:** determine whether the hook fires in
subagents at all here, and if it does, what `subagentIdentity()` returns for a
dispatch launched through the `Agent` tool. Note that hook 9's matcher
(`Bash|Edit|Glob|Grep|NotebookEdit|Read|Task|TodoWrite|WebFetch|WebSearch|Write`)
names `Task` but not `Agent` or `Workflow`, while the sibling hook on the next
line does name `Workflow` — whether that asymmetry matters for subagent
counting is exactly the thing to measure rather than assume.

## Not yet decided (superseded in part by the correction above)

Candidate directions, none chosen:

- A `PostToolUse` hook that counts calls per dispatch and injects the running
  count back into the agent's context — the delivery channel for this is now
  confirmed to work (`additionalContext` reaches the model), so it is newly
  feasible in a way it was not when the budget rule was written.
- Requiring the dispatch to write its call count into its own dispatch-record
  `log` per phase, making the count an artifact rather than a memory.
- Dropping the stop condition's claim to be a safeguard and re-describing it
  as advisory, so dispatchers stop sizing budgets on the assumption it fires.

The first two cost work; the third costs nothing and is honest, but leaves the
data loss in place.

## Related

- `2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`
  (closed) — the hard cliff. This item is the soft limit's own blind spot, and
  closing that one did not address it.
