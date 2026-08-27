---
schema: pipeline.backlog-item.v1
id: pipeline.agent-binding-guards-are-not-os-level-sandboxing
type: idea
owner: pipeline
status: open
created: 2026-08-25
sprint: nova
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
