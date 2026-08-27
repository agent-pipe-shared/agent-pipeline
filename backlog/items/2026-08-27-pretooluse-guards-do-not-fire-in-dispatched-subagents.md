---
schema: pipeline.backlog-item.v1
id: pipeline.pretooluse-guards-do-not-fire-in-dispatched-subagents
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Measured live, 2026-08-27, while investigating why the dispatch-budget counter never moved: plugin PreToolUse hooks fire in the main session and never inside a dispatched subagent. Four independent measurements, listed below."
---

# In Claude Code, plugin PreToolUse guards do not fire inside dispatched subagents — the enforcement layer is inert for dispatched work

> **Scope correction, same day.** This was first recorded without naming the
> runner. All four measurements below are Claude Code. A PO hardening test in
> **Antigravity** on 2026-08-27 had its subagent refused by the push gate with
> the same guard error the parent received, so that runner does apply plugin
> guards across agents. The finding is a runner difference, not an
> architectural law — cite it with the runner named.

## Description

Every deterministic guard this repository relies on is registered as a plugin
`PreToolUse` hook in `plugins/pipeline-core/hooks/hooks.json`: the git-guard
union, the push gate, the protected-test-path guard, the dev-plan gate, the
shell-grammar/lifecycle guard, the dispatch preflight guard, and the dispatch
budget guard.

All of them fire for the orchestrating (Elephant) session. **None of them fire
for a dispatched subagent.** Work performed by a Goldfish or Critic dispatch
therefore passes no guard at all; what has kept dispatched work inside the
rules so far is the briefing prose in `templates/prompts/agent-obligations.md`,
obeyed voluntarily.

## Evidence — four measurements, not an inference

1. `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` works end to end when
   invoked exactly as the runtime invokes it (child process, PreToolUse payload
   on stdin, a real finished subagent's transcript path): it resolved the
   subagent identity, the git common dir and `maxTurns`, and wrote its
   observation record. The script is not the defect.
2. The same hook fires in the main session — it wrote its orchestrator marker
   under `<git-common-dir>/agent-pipeline/dispatch-budget/orchestrator-seen/`.
3. A `pipeline-core:goldfish-deep` dispatch made 51 tool calls: no counter file,
   no `unresolved.jsonl` entry. The hook never ran once.
4. An `Explore` subagent successfully ran a compound command (`echo a && echo b`)
   — the exact shape the lifecycle guard refuses with `GUARD-PARSE-UNSUPPORTED`
   in the main session, repeatedly, on the same day.

Measurements 3 and 4 cover both agent classes: plugin-defined agents and
generic ones.

## The claim this disproves

`plugins/pipeline-core/hooks/hooks.json`'s own `$comment` for the dispatch
budget hook states: *"Hooks DO reach subagents -- the same dispatch was refused
mid-run by guard-lifecycle-ready on its Bash|PowerShell matcher, which is the
control separating 'hooks do not fire in subagents' from 'this matcher is not
honoured'."*

That control was a misattribution: the refusal came from the main session, not
from inside the dispatch. The comment currently asserts the opposite of what is
measurable, and it is load-bearing — it is the reason the budget guard's matcher
was rewritten twice instead of the invocation path being questioned.

## Consequences worth stating separately

- **The dispatch budget guard cannot work as a PreToolUse hook at all.** It is
  architecturally unable to count what it was built to count. This is the same
  class as "a guard cannot enforce its own absence": the layer that would do the
  blocking is not present at the moment it would have to block.
- **Protected test paths are one-sided.** `guard-testpath` blocks the Elephant's
  edits to a TP-protected file and does not block a dispatched Goldfish's. A
  signed maintenance-window ceremony is therefore currently a process control,
  not a technical one.
- **The push gate has the same hole for dispatched work** — though the
  separately built `pre-push` git hook closes that one specific case, because a
  git hook runs inside the real git process regardless of which agent invoked it.

## A second hole, runner-independent, found by the same hardening test

Any guard that inspects tool-call parameter text is blind to what a permitted
command reads from disk. The PO's Antigravity hardening test defeated the push
gate in two steps that each look legitimate: write the forbidden command into
`scratch/push_bypass.sh` with the file-writing tool, then run
`bash scratch/push_bypass.sh`. The guard saw only the second string.

This is structural, not a pattern gap: no improvement to command classification
closes it, because the classifier never sees the payload. It applies to both
runners and to every guard in the manifest, and it is the strongest argument
for the same conclusion the proposal below reaches independently.

The installed `pre-push` git hook does close this specific case — git runs it
inside its own process regardless of how git was invoked. `git push --no-verify`
written inside such a script still defeats it, because `--no-verify` disables
git hooks by git's own design. The PO accepted that residual gap on 2026-08-27
rather than pay for OS-level sandboxing: an agent that goes that far is outside
the threat model this pipeline addresses.

## Proposal

Not designed here (this item records the gap). The shape of any answer is
constrained by the finding itself: enforcement that must survive a dispatch has
to live in a layer the subagent's own process actually executes. Three
candidates, none of them exclusive:

1. **Git hooks** (`pre-push`, `pre-commit`, `commit-msg`) — proven to run for
   any caller. `plugins/pipeline-core/scripts/pre-push-hook-install.mjs` already
   exists; nothing installs it during onboarding.
2. **Agent tool allowlists** — each `plugins/pipeline-core/agents/*.md` already
   declares its tools; a capability a dispatch does not have cannot be misused.
3. **Elephant-side post-hoc verification** — detection, not prevention, and
   therefore the weakest of the three; it belongs on top of one of the others,
   never instead of them.

## Affected artifact

- `plugins/pipeline-core/hooks/hooks.json` (the false `$comment`; TP-4 protected)
- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` (built, correct, inert)
- every other guard registered as `PreToolUse` in that manifest
- `templates/prompts/agent-obligations.md` (currently the only thing constraining
  dispatched work, and it is prose)

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
