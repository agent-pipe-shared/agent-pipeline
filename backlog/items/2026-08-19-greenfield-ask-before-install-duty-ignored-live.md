---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-ask-before-install-duty-ignored-live
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: 2026-08-20
closure_repository: self
closure_commit: b5354f250e2ff10698062fa4927f471f5fc3357a
closure_evidence: plugins/pipeline-core/hooks/onboarding-consent-guard.test.mjs
source: "PO, live, 2026-08-19: full session transcript from a fresh Claude Code v2.1.235 greenfield session in a separate, ungoverned test repo (~/src/Rune_Test1_Claude_060_53). Quoted directly by the PO with the exact terminal output."
---

# Greenfield ask-before-install duty is ignored despite strict wording reaching the agent's context

## Description

`plugins/pipeline-core/hooks/codex-session-start-hint.mjs` (despite its
`codex-` filename prefix, this hook fired for a Claude Code session too —
runner-neutral in practice) emits, for an ungoverned folder, both:

- a short `systemMessage` (line 117): "Agent Pipeline is available as an
  optional project workflow, but it is not active in this folder. Ask the
  user whether they want to install it before running any Pipeline
  command."
- a much stricter `hookSpecificOutput.additionalContext` block (lines
  121-128) that IS correctly wired to reach the agent's context (confirmed
  by reading `main()`, lines 165-179): "On the user's first request,
  briefly explain that Agent Pipeline adds a structured, verifiable
  delivery workflow, then ask whether it should be installed for this
  repository." / "End that turn and wait." / "Before an explicit
  affirmative answer, do not invoke pipeline-core:pipeline-start, inspect
  or plan onboarding, initialize Git, or **change project files**."

Despite this, in the live transcript the PO supplied: the user's first
request was "baue mir dieses Browser-Game" (build me this browser game,
with a full attached design document). The agent went straight to
`Write(index.html)` and `Write(styles.css)` — a direct violation of "do not
... change project files" and "End that turn and wait" — without ever
asking about Pipeline installation. Only after the PO explicitly
interrupted and asked "warum hast du das ignoriert?" (why did you ignore
that?) did the agent surface the question, self-diagnosing that it had read
the instruction as scoped to "before triggering a pipeline-core command"
specifically, not "before any file-changing work."

**This is not (only) a wording-strength problem** -- the actual delivered
instruction is already about as explicit as prose gets ("do not... change
project files", "End that turn and wait"). The gap is that a concrete,
detailed, competing user task request (a full attached game design
document) apparently outweighed a SessionStart-injected `additionalContext`
instruction in practice, for this model/session. Prose-only compliance was
not sufficient.

## Proposal

Two independent angles, likely both warranted:

1. **Reword for zero ambiguity anyway** — even though the instruction is
   already strict, tighten "before running any Pipeline command" (the
   visible short message) so it cannot be misread as scoping to
   pipeline-core commands specifically; make the short message itself say
   "before any project work," matching the stricter context block.
2. **Back it with a technical guard, not prose alone** (the stronger fix,
   matching this repo's own general design philosophy of guard-enforced
   rules over prose-only ones): a PreToolUse check that blocks the first
   mutating tool call (Write/Edit/a Git-initializing Bash command) in an
   ungoverned folder where the Pipeline plugin is installed, unless a
   session-scoped "consent asked and answered" marker is already recorded
   -- forcing the ask-and-wait step structurally rather than trusting
   instruction-following alone.

## Triage

Not yet triaged.

### Direction 2 design, 2026-08-19

**Direction 1 ships independently and first.** The short `systemMessage`
reword (line 117 of `codex-session-start-hint.mjs`, "before running any
Pipeline command" → "before any project work") needs no design and no
technical dependency on Direction 2 — dispatch it as a one-line mechanical
edit whenever convenient, ahead of or alongside Direction 2.

**Ungoverned-folder definition (reuse, don't reinvent).** Both
`codex-session-start-hint.mjs:13-20` and `guard-lifecycle-ready.mjs:98`
already carry an identical `GOVERNANCE_MARKERS` array (`.agent-pipeline/
core.lock.json`, `pipeline.user.yaml`, `project/pipeline.json`,
`project/pipeline.yaml`, `.claude/pipeline.json`, `.claude/pipeline.yaml`)
and `guard-lifecycle-ready.mjs:2509-2513` already computes `governed` the
same way and returns `verdict(0)` unconditionally when `!governed`. That is
the exact integration point: this is a duplicated-but-consistent check
already, and the fix replaces one `if (!governed) return verdict(0);` line
with the narrower logic below — no new "governed" definition, no new file
existence check.

**Trigger scope (MVP): Edit/Write/NotebookEdit only, not Bash.**
`guard-lifecycle-ready.mjs` already runs on both `Bash|PowerShell` and
`Edit|Write|NotebookEdit` matchers (`hooks.json`). The confirmed live
incident was two `Write` calls — gate exactly the tool that violated the
duty. A Bash-command mutation classifier (e.g. detecting `git init`) is
real future scope but adds real false-positive surface (distinguishing a
mutating command from a read-only one in free-form Bash is not reliable);
leaving Bash ungated in this MVP is a deliberate, stated scope cut, not an
oversight.

**Session-scoped consent marker: a file, keyed by `session_id`, mirroring
the ALREADY-ESTABLISHED pattern in this same plugin
(`stop-suggest.mjs`'s `.claude/.stop-suggest-<session_id>.json` +
`resolveSessionIdFromInput()`, `stop-suggest.mjs:456-460`).** Each guard
invocation is a fresh process with no in-memory state across tool calls, so
only a file survives between the blocked call and the retried one.
`guard-lifecycle-ready.mjs:main()` already parses the full PreToolUse
`input` object (`main()`, ~line 2672-2675) and threads it into
`evaluateLifecycleReadyGuard(input, ...)` — the implementor needs to
confirm/thread `input.session_id` down to the ungoverned-branch scope
(~line 2506) the same way `stop-suggest.mjs` reads it from Stop-hook stdin;
Claude Code's PreToolUse payload carries `session_id` at the top level, so
this is wiring, not a design question.

Marker path: `.claude/.pipeline-install-consent-<session_id>.json`. **The
marker clears the gate on EITHER answer (yes or no), not consent alone** —
the underlying duty is "ask and wait for an answer before touching files,"
not "block all work until Pipeline is installed." A user who says no must
still be able to get their unrelated Write through, once, without being
asked again every subsequent turn of the same session. This directly
bounds the blast-radius risk named below.

**New sanctioned recorder script, admitted the same way this session
already added 4 admission branches to `sanctionedOnboardingArgs()`
today** (`intake-consent-apply`/`intake-capture-apply`/
`intake-design-questions-apply`/`intake-generate-apply`, commits
`70bd1fb3`/`0b2386fd`): `plugins/pipeline-core/scripts/
onboarding-consent-mark.mjs record --root <root> --session-id <id>
--answer yes|no` — writes
`{schema: "pipeline.onboarding-consent-mark.v1", sessionId, answer,
recordedAt}` atomically (same `writeExclusiveSynced`/`renameSync`/
`fsyncDirectory` pattern already used elsewhere in this codebase, e.g.
`scratch/apply-guard-handover-size-wiring.mjs`'s documented approach) to
the marker path. **No new guard-admission branch is actually required for
this script's own Bash invocation**: Bash/PowerShell calls stay outside
this gate's scope in the ungoverned branch (see trigger scope above), so
they already pass through unconditionally today and continue to.

**PreToolUse pseudocode (replaces the current unconditional
`if (!governed) return verdict(0);`):**

```js
if (!governed) {
  const toolName = input?.tool_name;
  if (toolName !== "Edit" && toolName !== "Write" && toolName !== "NotebookEdit") {
    return verdict(0); // Bash/PowerShell and everything else: unchanged
  }
  const sessionId = resolveSessionIdFromInput(input); // mirror stop-suggest.mjs
  if (!sessionId) return verdict(0); // fail-open: no session context, never block on this alone
  const markerPath = join(root, ".claude", `.pipeline-install-consent-${sessionId}.json`);
  if (existsSync(markerPath)) return verdict(0); // already asked+answered this session, either way
  return verdict(2, ONBOARDING_CONSENT_GATE_MESSAGE);
}
```

`ONBOARDING_CONSENT_GATE_MESSAGE` (new constant): instructs the agent to
ask the user in their own language whether Agent Pipeline should be
installed for this repository, then run the exact `onboarding-consent-mark.mjs
record` command with the observed answer, then retry the identical write —
mirroring the existing `--granted`/HGO-style "typed read-only recovery
action" pattern this guard already uses elsewhere.

**Named, real trade-off for the PO to weigh before dispatch (not resolved
here):** this gate fires plugin-wide, for EVERY Claude/Codex session that
has this plugin installed and opens ANY ungoverned folder — including a
user doing completely unrelated, non-Pipeline work who has no interest in
onboarding. The design above bounds the cost to a single one-time pause per
session, cleared by either a yes or a no answer, which matches the
already-existing prose duty's own intent ("ask... then... after consent" —
never "force install"). But it is still a real, visible behavior change for
every consumer of this plugin, not just this repo, and is worth an explicit
go-ahead before implementation, not an implicit one.

**Implementation checklist for the dispatch:** (1) new
`onboarding-consent-mark.mjs` script + its own tests; (2) the
`guard-lifecycle-ready.mjs` pseudocode above + `session_id` threading +
tests (positive: marker present → allow; negative: marker absent, tool
Edit/Write/NotebookEdit → block; Bash unaffected; no `session_id` →
fail-open); (3) add the marker glob (`.claude/.pipeline-install-consent-*.json`)
to `.gitignore` if not already covered by an existing `.claude/.*` pattern;
(4) Direction 1's reword, landed separately or in the same dispatch.

### Progress, 2026-08-19 — Direction 1 landed; Direction 2 twice failed with zero output, deferred

**Direction 1 is done and on trunk**, landed by an unrelated dispatch
(NVA-W5-DOCFIX-1, commit `b7982cdb`): item (4) above is satisfied.

**Direction 2 (the PreToolUse consent guard) failed twice, both times with
zero output**, despite explicit PO go-ahead for the design (this session,
`AskUserQuestion` → "Ja, dispatchen"):

- Attempt 1 (`NVA-W5-CONSENTGUARD-1`, goldfish-deep, worktree-isolated,
  briefed by citing this item's own Triage-section design and telling the
  dispatch which sections to read): used its full 50-tool budget on
  discovery (grepping for atomic-write helpers, hunting for the session-id
  marker precedent) and returned empty text with zero commits, zero
  uncommitted diff.
- Attempt 2 (`NVA-W5-CONSENTGUARD-2`, same agent type, full design
  pre-inlined verbatim into the briefing itself — exact anchor lines,
  exact pseudocode, exact new-file contract, specifically to remove the
  need for any discovery): STILL used its full 50-tool budget and returned
  empty text with zero commits, zero uncommitted diff, and its dispatch
  record shows not even a bootstrap log entry — the opening act the
  briefing itself mandates as step 1.

Both attempts are budget-exhaustion failures with literally nothing
produced, not partial progress — unlike this same session's other Wave 5
dispatches (which returned either real diffs or an honest clean stop). This
is worth flagging as possibly systemic rather than task-specific: the
Elephant session itself hit the closed shell-grammar guard
(`GUARD-PARSE-UNSUPPORTED`/`GUARD-REDIRECT-UNAPPROVED`) repeatedly on
routine commands in the same session window, and it is plausible a
fresh-context dispatch loses more of its budget to the same friction with
no session-level memory of the pattern to route around it. Not confirmed —
no dispatch transcript showed the actual failure mode for attempt 2 (no log
entries to read). **Deferred rather than a third automated retry** — two
full-budget zero-output attempts is the point to stop and hand this to a
dedicated future session with room to diagnose the dispatch-side failure
itself, not just re-attempt the same task.

### Closure, 2026-08-20

Both directions are now implemented. Direction 1 is present in commit
`b7982cdb`; Direction 2 is implemented in commit `b5354f25` with a
session-scoped marker recorder and PreToolUse coverage for Edit, Write, and
NotebookEdit. A missing session remains fail-open, Bash remains outside the
MVP scope, and the marker clears the gate for either recorded answer (`yes`
or `no`). Focused evidence: the consent guard and recorder tests both pass.
