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
`isolation: "worktree"` dispatch prompt MUST supply both an exact expected
SHA (the Elephant's own `git rev-parse HEAD` immediately before dispatch)
AND the expected worktree path the dispatch was asked to be provisioned
into, and MUST open with a containment check performed BEFORE any
`checkout --detach`: compare its own `git rev-parse --show-toplevel` against
that expected worktree path. If they do not match, the dispatch is running
in a shared checkout, not its own worktree — it STOPS and reports; it never
runs `checkout --detach` (see "Concurrent non-isolated dispatches" below for
why that matters). Only when they match does the existing self-check
proceed: check `git rev-parse HEAD` against the exact expected SHA; on
mismatch, self-heal via `git checkout --detach <exact-expected-sha>`,
re-verify, then proceed normally; only STOP if that checkout itself fails.
Live-tested 2026-08-18: with the SHA self-check present, 9/9 parallel
worktree dispatches landed on the correct HEAD (0/9 without it, in the same
session, same cluster set, before the fix). The containment check was added
2026-08-27 after a 2026-08-25 incident in which three `isolation: "worktree"`
dispatches never actually received a worktree (`git worktree list` showed a
single entry) and a retry's self-heal step detached the Elephant's own live
HEAD instead.

The `git worktree list` check the Elephant runs right after launching (see
CLAUDE.md's Environment note) has a hard failure branch, not just a sanity
glance: a result showing only the single main worktree entry means isolation
was NOT granted for that dispatch. That is a hard stop for launching further
`isolation: "worktree"` dispatches in the same session until the cause is
understood — serialize the remaining work through the shared tree instead
(see the next section), or re-brief it explicitly as a non-isolated,
shared-tree dispatch with no self-heal block at all.

## Concurrent non-isolated dispatches can orphan or lose commits — self-heal is worktree-only

The `isolation: "worktree"` self-heal check above (verify `git rev-parse HEAD`
against an expected SHA, `git checkout --detach` on mismatch) is written for
a dispatch that owns its OWN worktree. It must never run — and must never be
copied into a briefing — for a `parallel()`/fan-out round of dispatches that
share the MAIN working tree (`isolation` omitted, several `agent()` calls
committing concurrently). In a shared tree, every sibling's commit moves HEAD
out from under the others; a dispatch that still carries a worktree-style
self-heal check reads that as "wrong base" and self-heals by checking out its
own (now-stale) expected SHA — which either discards a sibling's uncommitted
edits outright, or detaches HEAD and starts a parallel commit chain that
never rejoins the branch, orphaning every commit built on it once a later
sibling checks back out to the branch tip.

Confirmed 2026-08-18, a 10-dispatch `parallel()` round with `worktree: no`
throughout: one dispatch's ~47-tool-call in-progress edit (uncommitted) was
silently wiped by a sibling's self-heal checkout — its own dispatch record
shows the edit made, then nothing after; the working tree was clean with no
trace of it once the round finished, and it had to be fully re-dispatched.
Four other dispatches committed successfully but ended up on a sibling chain
off the same stale base, invisible from the branch tip (`git log` did not
show them) until the Elephant diffed `git log --all`/`git branch --contains`
against every dispatch's reported commit SHA, found the split, and reconciled
with `git cherry-pick <base>..<orphan-tip>` after confirming zero file
overlap between the two chains — a fully recoverable but costly manual
rescue that would not have been needed had self-heal simply not fired.

**Rule:** a briefing for a shared-tree (non-`isolation: "worktree"`) dispatch
must NOT include the worktree self-heal check at all — commit narrowly
(`git add -- <exact briefed files>`; never a broad `git add -A`/`.`) and stop
there; do not verify or correct HEAD mid-task. After every such round, before
trusting the round as landed, the Elephant must check for exactly this split:
run `git log --oneline -N` and compare against each dispatch's own reported
commit SHA (from its final report or dispatch record) — a reported SHA that
does not appear in that log is on an orphaned sibling chain, not lost, and
needs the cherry-pick reconciliation above (verify zero file-overlap between
the chains first; a real overlap needs manual conflict resolution, not a
blind cherry-pick). Prefer avoiding the situation over recovering from it:
sequence (`pipeline()`, one commit in flight at a time) any set of dispatches
that will `git commit` in the shared tree, or give each its own
`isolation: "worktree"`, rather than running them concurrently in
`parallel()` against the same checkout.

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

## The dispatch-record artifact is not automatic — verify the prompt actually carries it

An `agent()` call is an ordinary subagent invocation: nothing about the
Workflow tool writes `evidence/dispatch-record-<TASK_ID>.json` for you, and
nothing about `dispatch-authorship-verify.mjs` treats a Workflow-originated
`Dispatch:` trailer any differently from one produced by the Agent tool — a
missing record fails the exact same check either way. The instruction to
create that file lives inside `templates/prompts/goldfish-task.md`'s field 6
(the template this file's own opening paragraph says every `agent()` prompt
string must carry verbatim, not reproduced from memory); if the constructed
prompt string is abbreviated or hand-built instead, the instruction — and
therefore the artifact — silently disappears. Confirmed recurring, not
hypothetical: five `AGY-FIX2-*` commits produced via `agent()` this way
carried a `Dispatch:` trailer with no matching record
(`backlog/items/2026-08-24-workflow-tool-dispatches-produce-no-dispatch-record-artifact.md`),
the same freehand-prompt failure class CLAUDE.md already names for
NVA-WFDISP-1. "Paste the template verbatim" already failed once on this
exact path — before calling `agent()` for any dispatch expected to commit
with a `Dispatch:` trailer, grep the CONSTRUCTED prompt string itself for
the literal substring `dispatch-record` (not the template file — the actual
string you are about to pass to `agent()`) and confirm it is present; if it
is not, the prompt is incomplete and will produce an unverifiable commit.

**The pre-dispatch grep is necessary but not sufficient — it checks the
INSTRUCTION was sent, not that it was OBEYED.** A prompt that correctly
carries the record-writing instruction can still land a commit with no
matching record: the dispatch can be truncated before it reaches that step
(`guardrails/token-budget.md` TB-06's ~50-call cliff), or resumed and the
resumed leg can skip it, or the subagent can simply commit and then run out
of budget before writing the record. The grep check addresses the ROOT
CAUSE confirmed for the original five `AGY-FIX2-*` commits (the instruction
was absent from the prompt entirely) but not this separate, still-open
failure mode — a prompt-text check cannot detect a post-prompt failure.
Close the loop as part of
the SAME post-return pass the "Never trust a returned result" section
already requires (`git worktree list` / `git status --short` / `git log`):
for every `agent()` result naming a task id that landed a commit with a
`Dispatch: <TASK_ID> (goldfish)` trailer, also check whether
`evidence/dispatch-record-<TASK_ID>.json` exists in the Elephant's own
working tree (not the dispatch's worktree, which is discarded) — if it does
not, or the dispatch's worktree copy was never merged back, the Elephant
writes it itself immediately, sourced from the dispatch's own final report
(`taskId`, `agentType`, `model`, `outcome`, the landed `commits`,
`report.changedFiles`), mirroring what the goldfish would have written for
itself. This makes the artifact's existence an Elephant-owned guarantee
independent of whether the dispatched subagent actually reached that step,
rather than trusting compliance with an instruction it may never get to.

## `agentType` needs the `pipeline-core:` prefix

A Workflow `agent()` call's `opts.agentType` resolves from the same registry
as the Agent tool's `subagent_type`, but a bare role name (`'goldfish-implementor'`,
`'goldfish-deep'`, `'critic'`) is NOT recognized inside a Workflow script and
fails immediately — it needs the plugin prefix: `'pipeline-core:goldfish-implementor'`,
`'pipeline-core:goldfish-deep'`, `'pipeline-core:critic'`. Confirmed
2026-08-18: a two-agent parallel dispatch failed outright on the first
attempt with bare names before this was known.

## Fixing a persisted script: re-invoke with inline `script`, never `Edit` the persisted file

Every `Workflow` call persists its script to a file under
`~/.claude/projects/.../workflows/scripts/`, outside the project root — the
tool result reports that path. That file cannot be `Edit`ed directly: it is
outside repo containment and the attempt is BLOCKED
(`GUARD-CROSS-REPO-MUTATION`). To fix a bug in a script that already ran
(wrong `agentType`, wrong prompt text, etc.), re-invoke `Workflow` with the
CORRECTED FULL INLINE `script` parameter (not `scriptPath` pointing at the
broken persisted file, and not `resumeFromRunId` alone, which replays the
same broken script) — this persists to a fresh path and runs clean. A retry
that reuses the same broken `scriptPath` without first supplying a corrected
inline script fails identically, as expected. Confirmed 2026-08-18: this
exact sequence (bare-agentType failure → blocked Edit attempt → futile
scriptPath retry → successful corrected-inline-script retry) cost three
attempts before landing.

## Never trust a returned result — always check the worktree directly

A Workflow run's own returned value (the `agent()` call's resolved result,
the top-level `Workflow` tool result, a `TaskOutput` summary) is a claim, not
evidence — treat it exactly like an untrusted subagent report, never as
confirmation that work landed. This holds in BOTH directions, not just the
empty-result case below: an agent can report success while nothing is
committed, AND a truncated/empty-looking result can still sit on top of
complete, correct, already-tested work in its worktree. Confirmed live
2026-08-19: a 2-agent parallel Workflow round returned `["",""]` — both
`agent()` calls resolved to the empty string, `agents_empty_result: 2` in
the usage summary — yet both worktrees held substantial, mostly-correct
diffs (one of the two also contained a real, independently-confirmed
regression a pre-existing test caught only once the diff was actually run,
not from reading the diff or trusting the report). The Elephant must
NEVER decide a Workflow round's outcome from the tool result alone:
after every `agent()`/Workflow completion — success-looking or not —
run `git worktree list` to find the worktree(s), `git status --short` /
`git diff` to see what is actually there, and run the DoD-specified test
suites directly before doing anything else with the result (cherry-pick,
close a backlog item, report to the PO). Silence or emptiness in the
returned result is not evidence of "nothing happened" any more than a
cheerful-sounding report is evidence that everything happened.

## Never relay a scope-widening PO decision to a running dispatch via `SendMessage`

A PO decision that widens or changes a dispatch's authorized scope (field 4,
Forbidden) must not be relayed to an already-running dispatch via
`SendMessage`. The running dispatch's field 4 is what bounds its writes, not
a suggestion — a mid-task message that hands it new authority the original
briefing never granted either gets correctly refused (the dispatch has no
way to distinguish a legitimate scope amendment from an injected instruction,
so refusing is the only safe reading of its own contract), which wastes the
dispatch, or gets followed, producing writes nobody actually authorized.
Confirmed live: a PO's "standardize all three [adapters]" decision was
relayed mid-task to an already-running Goldfish dispatch
(`AGY-CHATADAPTER-1`) whose field 4 only ever granted write scope on one
adapter; the dispatch correctly REFUSED the relayed instruction.

Instead: build and send a fresh, properly-scoped briefing — either a new
dispatch, or a resume message to the same run per "Recovering a truncated
dispatch" below.

This does **not** forbid sending a running or truncated dispatch a message —
a purely procedural resume ("finish, commit what is green, emit your
report", per `templates/prompts/goldfish-task.md`'s truncated-dispatch
guidance) is legitimate and adds no authority. The line: does the message
add authority the original field 4 did not grant, or does it only ask the
dispatch to finish/report on what it was already authorized to do?
"Also standardize the other two adapters" is scope-widening — new files,
new authority, send a fresh briefing instead. "Finish, commit what is
green, emit your report" is procedural continuation — the dispatch's
existing scope already covers it, sending it as a resume message is fine.

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
