# Workflow-tool dispatch (fan-out orchestration)

Loaded when the Elephant uses the Workflow tool (`agent()`/`parallel()`/
`pipeline()`) to fan out Goldfish/Critic work, or when briefing any
`isolation: "worktree"` dispatch (Agent tool or Workflow `agent()`) — this is
the accumulated, live-tested operational knowledge for that execution mode,
not a re-statement of `roles/goldfish.md` or `roles/critic.md`.

## Only the Elephant orchestrates fan-out

The Workflow tool and the Agent tool's own fan-out capability are Elephant-only.
Never delegate a Workflow/Agent-tool call to a fork or a `general-purpose`
subagent, even for a task framed as "just research" or "read-only" — both
subagent types inherit the FULL parent toolset (confirmed: unlike the
Pipeline's own `goldfish-*`/`critic` role definitions, which are tool-scoped
in `plugins/pipeline-core/agents/*.md` to exclude Agent/Workflow entirely),
so nothing stops them from launching their own dispatches if not explicitly
told not to. Confirmed incident, 2026-08-18: a fork briefed for read-only
research self-authorized two Workflow launches beyond its brief; contained
with zero lasting effect, but avoidable. Any fork or `general-purpose`
dispatch whose task could plausibly tempt further delegation MUST be told
explicitly in its prompt: "never invoke the Workflow or Agent tool — report
findings back for the Elephant to act on." A dispatched `goldfish-*`/`critic`
agent needs no such instruction; it has no access to invoke either tool.

## `isolation: "worktree"` self-heal (mandatory in every such briefing)

See `CLAUDE.md`'s Environment note for the full root-cause writeup (the
authoritative source — this is a pointer, not a duplicate). In short: a fresh
worktree is provisioned from the LOCAL `refs/remotes/origin/HEAD` symbolic
ref's target, not the current branch, so it can land on a stale base. Every
`isolation: "worktree"` dispatch prompt MUST open with: check
`git rev-parse HEAD` against an exact expected SHA supplied in the prompt
(the Elephant's own `git rev-parse HEAD` immediately before dispatch); on
mismatch, self-heal via `git checkout --detach <exact-expected-sha>`,
re-verify, then proceed normally; only STOP if that checkout itself fails.
Live-tested 2026-08-18: with this instruction present, 9/9 parallel worktree
dispatches landed on the correct HEAD (0/9 without it, in the same session,
same cluster set, before the fix).

## Tool-call budget — the ~50-call termination cliff

`guardrails/token-budget.md` (TB-06, Claude compatibility projection)
documents an observed Claude-Workflow-agent hard termination near 50 tool
calls. This is real and expensive when missed: a dispatch that runs into it
blind does real, often-correct implementation work and then returns an EMPTY
final report with nothing committed — the work is recoverable (it sits
uncommitted in the dispatch's worktree/directory) but the whole ~1M-token
dispatch has to be re-run or explicitly resumed to actually land it. Measured
2026-08-18: a 9-cluster round with no budget language in the briefings
averaged ~52 tool calls/agent and lost 7/9 dispatches to silent truncation;
a correction adding an explicit budget + checkpoint instruction to every
briefing fixed it in the very next round.

Every Workflow/Agent dispatch prompt that does real implementation work
(not a short, bounded read/decide task) MUST state a tool-call budget
(recommended: 40, i.e. TB-06's ≤45 with margin) and an explicit
checkpoint instruction: at ~80% of budget, if not yet done, STOP making
further edits, write/update the dispatch record with an accurate log of
what's done vs. remaining, and end the turn with that as the report. A
clean checkpoint at 80% beats a silent cutoff at 100% with zero report —
state this priority explicitly in the briefing, not just the number.

## Recovering a truncated dispatch

Do not discard a truncated dispatch's work without first checking: `git
status --short` / `git diff` in its worktree or working directory almost
always shows real, on-scope progress even when the final report came back
empty (`journal.jsonl`'s `result` field is `""`, not `null` — that is not
the same as the agent having done nothing). Resume by dispatching a
"finish-in-place" task pointed at the EXACT existing directory (no new
`isolation: "worktree"` — that would provision a fresh worktree and discard
the progress), briefed to read the existing diff and the original backlog
item's Triage, complete/verify/test/commit what's there, carrying the same
tool-call-budget discipline above.
