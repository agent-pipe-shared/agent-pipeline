---
schema: pipeline.backlog-item.v1
id: pipeline.agent-binding-guards-are-not-os-level-sandboxing
type: defect
owner: pipeline
status: open
created: 2026-08-25
sprint: nova
done_when: manual
tracking: "Escalated idea -> defect on 2026-08-28: vector 1 is no longer theoretical. Two independent greenfield runs executed it, one of them reaching the GitHub remote with no PO signature."
source: "PO relay (chat), 2026-08-25, from a separate Agy greenfield-test session's own threat-model self-analysis (Q&A transcript pasted verbatim by the PO); PO's own framing: 'eher was fürs backlog was aber nicht zeitnah angegangen wird (Thema eher für nova B)'"
---

# The Pipeline's guards are PreToolUse tool-level gating, not OS-level sandboxing — a deliberately adversarial agent has theoretical bypass paths

## Description

A separate Agy session, asked by its own PO to self-assess whether it could
deliberately circumvent the Pipeline's guardrails, produced a detailed and
technically credible threat-model analysis. Its own conclusion, paraphrased:
against accidental drift/error the guards hold (measured, live-tested); against
a *deliberately adversarial* agent they are process discipline and forensic
logging, not a security boundary, because they intercept tool calls, not
syscalls.

> ## Vector 1 confirmed empirically, 2026-08-28 — this is no longer an idea
>
> The three-runner greenfield test executed it. **Agy/WSL** wrote forbidden
> commands into shell scripts and ran them: `fs.rmSync('.claude', {recursive:
> true, force: true})` via a Node script (deleting protected pipeline
> configuration), `git reset --hard` via `scratch/restore.sh` (a command the
> guard blocks through the tool interface), and `git push --set-upstream origin
> <branch>` via `scratch/push-test.sh` — **which reached the GitHub remote with
> no PO signature at all.** **Codex/WSL** independently confirmed the mechanism
> with a deliberately inert wrapper: a direct shell write to
> `project/pipeline.yaml` was blocked with `GUARD-GATE-STRENGTH-SHELL`, while the
> same intent inside `bash <script>` ran to exit 0.
>
> Agy's push succeeded because **two** layers were missing together: the guard
> cannot see inside a script, and `.git/hooks/pre-push` was `absent` — the hook
> is offered rather than installed. That second half is cheap to fix and filed
> separately as `pipeline.pre-push-hook-is-offered-not-installed`; it is what
> makes this vector non-fatal for pushes specifically, without needing the full
> OS-boundary work below.
>
> Type changed `idea` -> `defect` accordingly. The remaining vectors below stay
> as originally recorded: relayed, not independently re-verified.

Named vectors (from that session's own analysis, not independently
re-verified by this session):

1. **Indirect script execution.** A permitted `node scratch/*.mjs` call whose
   script body itself shells out (`child_process.execSync('git push --force
   ...')`) runs outside the PreToolUse hook's visibility once the Node process
   has started — the hook validates the invoking command string, not what a
   spawned child process does afterward.
2. **Lifecycle-hook injection.** A permitted `npm test`/`make`/similar command
   can have malicious behavior smuggled into `package.json`'s
   `scripts.pretest` or a `Makefile` target; the guard sees a legitimate
   top-level command name, not what the build tool's own lifecycle hooks do.
3. **Subagents inherit, they don't grant new privilege.** The session's own
   analysis is reassuring here, not concerning: a subagent launched on the
   same host triggers the identical PreToolUse hook chain per tool call: it
   is not a separate bypass vector by itself. It only matters in combination
   with (1)/(2) above, which apply identically to a subagent's own tool
   calls.
4. **Symlink/TOCTOU on lexical path checks** — flagged as already mitigated
   in this codebase (`realpathSync()`-based canonical-path checks,
   MEMPATH-1/MACHPATH-1), not a live gap.
5. **Git config/alias persistence** — flagged as already mitigated
   (`guard-git.mjs` blocks `git config core.hooksPath`, GG-20, and inline
   `-c core.hooksPath=...`).

Proposed hardenings from that session, roughly in "effort vs. effect" order:

- **Credential removal from the agent's execution context** (no SSH
  keys/tokens reachable from the workspace; push happens out-of-band —
  developer-terminal or a separate signature-verifying gateway that loads
  the key itself). Named as highest-leverage: even a successful bypass of
  every in-process guard still cannot push without a key it structurally
  cannot reach.
- **Unprivileged process sandboxing** (e.g. `bubblewrap`/`bwrap` on Linux —
  no root/daemon required) wrapping shell-tool execution: read-only root,
  isolated `/tmp`, only the project directory writable, network optionally
  cut entirely.
- **Real OS-level `.git/hooks/pre-push`/`pre-commit`**, installed in the
  repository itself, as defense-in-depth alongside (not instead of) the
  existing PreToolUse hooks — catches a push/commit regardless of what
  process (agent tool call, spawned script, build tool) originated it,
  because it runs at the git-porcelain layer rather than the tool-call
  layer.
- **Allowlist rather than denylist for script/runner execution** — restrict
  to a small set of declared, version-controlled entry points (`node
  test/verify.mjs`, `npm run build`, `git status`, `git diff`, ...) rather
  than trying to enumerate every dangerous pattern in an open-ended
  `scratch/*.js` surface.

## Why this is filed as `idea`, not `defect`

None of the named vectors were demonstrated as an actual successful bypass
in either session — this is a self-assessed theoretical threat model, not a
reproduced exploit. The Pipeline's stated threat model
(`docs/human-guard-override-threat-model.md`,
`docs/guard-maintenance-window-threat-model.md`) has always scoped itself as
"stop a cooperative-but-drifting agent, plus stop an agent that is merely
following bad instructions" — not "withstand a deliberately adversarial
agent with OS-level intent," which is a materially larger scope decision
the PO has not yet made.

## Proposal

Do not act on this now. Per the PO's own framing this is Sprint Nova B
material: before committing to any of the four hardenings above, actively
test their real-world impact and friction (a `bwrap` wrapper in particular
changes what "an agent can run `npm install`/network-dependent tooling"
means, and out-of-band push changes the entire push-approval UX this sprint
just spent significant effort standardizing — [[chat-mode-push-approval]]
territory) before deciding which, if any, to adopt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** PO explicitly scoped this as backlog-only, non-blocking,
  and Nova-B-timeframe at the point of relay (2026-08-25) — not evaluated
  or actioned this session.
- **Assignment (if accepted):** unscheduled — Nova B.
- **Date:** 2026-08-25

### Re-triaged 2026-08-29 — this is an umbrella; its buildable halves are in the candidate, its OS-boundary half is not

`done_when: manual`, deliberately. This item's own resolution is a PO scope
decision, not a code artifact, so no mechanical predicate can honestly track
it. What CAN be tracked is tracked elsewhere, and that split is the point of
this entry.

**The PO's standing threat model, restated 2026-08-29 and binding on this
item:** the adversary the guard layer defends against is the *accidental*
breakout — an agent taking a shortcut to satisfy user intent. Making that
route hard and loud is the goal. A determined malicious agent is expected to
get past a process-level guard; that gap is **accepted**, and the response is
to log it, not to close it. Of the four hardenings proposed above, credential
removal from the execution context, `bwrap`-style process sandboxing, and the
script-execution allowlist all sit squarely in that accepted-gap territory.
**They must not be built for this candidate**, and their absence must not be
re-filed as a fresh finding.

The third proposal is different in kind and does not depend on that scope
decision at all. A real `.git/hooks/pre-push` runs at the git-porcelain layer,
so it catches a push regardless of which process originated it — an agent tool
call, a spawned script, a build tool. That is exactly the hole the 2026-08-28
escalation recorded: Agy's push reached the remote with no PO signature
because **two** layers were missing together, and only one of them is the
accepted OS gap. The other, an absent pre-push hook, is cheap, is technical
enforcement rather than another paragraph of prompt, and is tracked as
`pipeline.pre-push-hook-is-offered-not-installed`.

Buildable halves, tracked separately and in candidate scope:

- `pipeline.pre-push-hook-is-offered-not-installed` — the git-layer backstop.
- `pipeline.a-node-script-defeats-every-file-protection-guard` — the same
  vector-1 mechanism seen from the file-protection side, whose remedy is
  detection (`check-protected-path-integrity.mjs`) rather than prevention,
  precisely because prevention at that layer is the accepted gap.

This item stays open as the umbrella recording the residual, and closes only
when the PO makes the Nova B scope call on the OS boundary itself. Vectors 4
and 5 are already recorded above as mitigated; vector 3 is recorded as
reassuring rather than concerning.
