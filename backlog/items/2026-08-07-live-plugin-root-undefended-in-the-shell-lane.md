---
schema: pipeline.backlog-item.v1
id: pipeline.live-plugin-root-undefended-in-the-shell-lane
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Finding SL-1 of the PHX-R2-THREATMODEL-rework dispatch (2026-08-07), re-verified independently by the Elephant at source. Security class. NOT executed by either party — confirming it empirically would mean disarming the guard that is enforcing at the time."
---

# The live plugin root is defended in the write lane only; the shell lane has no control that reaches it

## Description

GS-6 refuses any write **tool** targeting a path inside a live plugin root, and
does so without any override (`plugins/pipeline-core/hooks/guard-gate-strength.mjs`,
`LIVE_PLUGIN_RULE`). That is the write lane, and it holds: the hook is wired for
`Edit|Write|NotebookEdit` only.

The shell lane has two candidate controls, and **neither reaches the live plugin
root**:

1. **The gate-strength shell needles.** `gateStrengthShellRefusal`
   (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:206`) builds its
   needles as `GATE_STRENGTH_PATHS.map((rule) => basename(rule.path))`. The live
   plugin root is deliberately not in that table — the comment at `:197-205`
   states the reason and it is a good one: matching the root would refuse
   `node <pluginRoot>/scripts/project-onboarding-v3.mjs inspect`, the very
   command the readiness gate instructs the operator to run.

2. **The compensating control that same comment cites.** `:202-204` says shell
   writes into the enforcing plugin root "are already refused by
   GUARD-CROSS-REPO-MUTATION whenever the installed copy sits outside the
   project root". That control is
   `isForbiddenCrossRepositoryMutation`
   (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:514-577`), and it is
   **an enumerated allowlist of executables, not a general write check**:

   - `codex … plugin add|remove|update|install|uninstall` and
     `codex … plugin marketplace add|remove|update` (`:534-542`)
   - `python|python3|py` running one specific script,
     `update_plugin_cachebuster.py` (`:544-550`)
   - `git -C <path outside root>` when not a read-only diagnostic (`:552-559`)
   - a fixed `mutatingTargets` set: `cp, mv, rm, mkdir, rmdir, touch, chmod,
     chown, chgrp, ln, install, truncate, tee, rsync` (`:561-570`)
   - `sed` with `-i` / `--in-place` (`:571-576`)
   - otherwise `return false` (`:577`)

   Plus a redirect check (`:519-527`) — but the closed shell grammar refuses
   redirects anyway, so that path is not the interesting one.

   **An interpreter is on none of those lists.** A simple command whose
   executable resolves to `node` (or any other interpreter) falls straight
   through to `return false` at `:577`, regardless of what the interpreted
   program then writes and where. `node -e` is an ordinary simple command under
   the closed grammar — the file's own GS-1 discussion at `:178-181` makes
   exactly this observation about `pipeline.user.yaml`, and closes it by adding
   that path to the needle table. The live plugin root, by design, cannot be
   closed that way.

## Why this matters more than an ordinary gap

The whole premise of the guard kernel is that an agent must not be able to
disarm the gate that is enforcing its own actions. Guard scripts are re-read on
every invocation — that is the stated rationale of `LIVE_PLUGIN_RULE` itself.
So a write into the installed copy takes effect immediately, within the same
session, against every subsequent guard decision.

This is also the shape the file already names for the level above it: *"Same
shape as GS-6 one level up: the config decides a gate's strength, the installed
code decides whether the config is read — and the shell decides everything,
because it was never asked"*
(`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:183-185`). The finding is
that the same sentence is true of GS-6 itself, one level further down, and there
the compensating control does not in fact compensate.

**Not demonstrated empirically, deliberately.** Neither the dispatch that found
it nor the Elephant that re-verified it attempted the write: a proof-of-concept
here is an actual disarming of the running guard, which no agent should perform
and which this repository's own rules forbid. The finding rests on reading the
control's source, which is sufficient — the allowlist is closed and explicit,
and `node` is verifiably absent from it.

## Triggering situation

Raised as SL-1 while the `PHX-R2-THREATMODEL-rework` dispatch re-derived
residual R2's premise against the PO's 2026-08-07 threat-model correction (the
adversary is the agent, not a human attacker). The dispatch needed to establish
whether an agent can alter the live plugin copy at all; the write-lane answer is
a clean "no", the shell-lane answer is this item. The Elephant re-read
`isForbiddenCrossRepositoryMutation` independently and confirms the
characterization.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
(`isForbiddenCrossRepositoryMutation` at `:514-577`; the comment claiming the
compensating control at `:197-205`, specifically `:202-204`) and
`plugins/pipeline-core/hooks/guard-gate-strength.mjs` (`LIVE_PLUGIN_RULE`,
whose guarantee this bounds to the write lane).

Note the comment at `:197` is separately wrong about its own scope, tracked in
`backlog/items/2026-08-07-gate-strength-shell-comment-understates-its-own-scope.md`.
That item is cosmetic; this one is not, and the two should not be merged.

## Proposal

**Owner: PO. Needs its own design pass and a T1 review — do not fix in-session,
and do not fix it inside an unrelated package.** Directions are disclosed, not
pre-selected, because each has a real cost and the cheap-looking one is a trap:

1. **Widen the cross-repository mutation check from an executable allowlist to a
   default-deny for writes outside the project root.** Correct in principle and
   closes the class rather than one instance. Expensive: it must not break the
   bootstrap and recovery commands that legitimately execute plugin scripts by
   absolute path, and "which invocations write" is not decidable from a command
   line for an interpreter.
2. **Add the live plugin root to the shell needles after all, with a carve-out
   for the known-good invocation shapes** (executing a plugin script, not
   writing to one). Narrower, but the carve-out is the whole difficulty, and a
   wrong carve-out reintroduces the hole while looking closed.
3. **Accept the residual explicitly and move the guarantee elsewhere** — e.g. an
   integrity check of the installed copy at bootstrap, so a modified plugin is
   detected rather than prevented. Note this is adjacent to residual R2's
   subject matter and must not be silently folded into it: R2 concerns
   provenance of the *installed distribution*, this concerns *in-session
   tampering*, and conflating them would let one design appear to answer both.

Whatever is chosen, the comment at `:202-204` must stop asserting a
compensating control that does not compensate — that sentence is what allowed
the gap to look closed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
