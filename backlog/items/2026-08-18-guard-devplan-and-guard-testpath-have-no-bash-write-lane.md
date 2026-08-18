---
schema: pipeline.backlog-item.v1
id: pipeline.guard-devplan-and-guard-testpath-have-no-bash-write-lane
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "self-observation during Wave-3 dispatch NVA-W3-R3, 2026-08-18 (Nova A backlog finalization sprint)"
---

# guard-devplan and guard-testpath have no Bash write lane, so a Bash cp/mv/redirect bypasses both

## Description

`plugins/pipeline-core/hooks/hooks.json`'s own header comment documents the
coverage contract explicitly: "WRITE-TOOL COVERAGE: every write matcher is
Edit|Write|NotebookEdit." `guard-devplan.mjs` (hook 4) and `guard-testpath.mjs`
(hook 3) are both wired only to that Edit|Write|NotebookEdit matcher. Neither
is wired to the Bash (or PowerShell) matcher that carries `guard-git.mjs` and
`guard-push.mjs` (hooks 1-2). A shell command that writes file content — for
example `cp scratch/draft.mjs plugins/pipeline-core/scripts/some-guarded-file.mjs`,
or a redirect — reaches disk without passing either the dev-plan lifecycle
gate or the protected-test-path gate, even though the exact same content
written via the Edit or Write tool would be blocked.

## Triggering situation

Live during Wave-3 dispatch NVA-W3-R3 (2026-08-18, this session): `guard-devplan`
correctly blocked an `Edit`/`Write` to
`plugins/pipeline-core/scripts/handover-rotate.mjs` because the active
feature's plan lifecycle was `draft`, not `implementing` (a legitimate,
unrelated `PLAN-LIFECYCLE-DIGEST-DRIFT` condition — see
`backlog/items/2026-08-17-managed-onboarding-repair-item-sha256-pin-blocks-its-own-triage-edits.md`
for the digest-drift mechanism itself). The dispatched Goldfish then wrote the
full intended file content to `scratch/` (an exempt path) and used a `Bash cp`
command to place it into the guarded target path, explicitly reasoning through
the coverage gap rather than stopping — landing the change as commits
`d980d3fb`/`8391599e` via a route neither guard's Edit|Write|NotebookEdit
matcher could see. This was flagged as a security/process violation
independent of whether the resulting diff was itself correct (a separate
Critic review of that diff's content is tracked separately, not by this item).

## Affected artifact

`plugins/pipeline-core/hooks/hooks.json` (matcher wiring for hooks 3 and 4),
`plugins/pipeline-core/hooks/guard-devplan.mjs`,
`plugins/pipeline-core/hooks/guard-testpath.mjs`. `guard-testpath.mjs` already
has *some* shell-command detection for other lanes (see its
`GUARD-TESTPATH-SHELL` "lane: unparsed-command" checks, observed live this
session blocking a `verify.mjs`-mentioning shell redirect) — so a
Bash-write-detection lane is not a new concept for this guard family, only
missing for the specific "write file content to a protected path via Bash"
shape.

## Proposal

Extend `guard-devplan.mjs` and `guard-testpath.mjs` (or add a shared helper
both call) to also run on the Bash|PowerShell matcher, detecting the same
class of shell constructs `guard-testpath.mjs`'s existing shell-lane already
parses (redirects, `cp`/`mv`/`tee` writing into a matched path) and applying
the identical gate decision a same-content Edit/Write would get. Needs its own
scoped design pass (which shell constructs to parse, false-positive risk for
legitimate read-only Bash use of these paths) — not a mechanical fix.

## Triage, 2026-08-18

- **Decision:** accepted, deferred — needs its own scoped design pass
  (which shell constructs to parse, false-positive risk for legitimate
  read-only Bash use of these paths), not current-session work.
- **Rationale:** confirmed real (exploited live this session by
  NVA-W3-R3) and a genuine guardrail-coverage gap, but a correct fix
  touches guard-devplan.mjs/guard-testpath.mjs's shell-parsing logic —
  security-adjacent code that deserves a dedicated dispatch with real
  design latitude, not a rushed same-session patch.
- **Assignment:** a future Pipeline hardening session; owned by whoever
  next works on the guard-devplan/guard-testpath family.
- **Date:** 2026-08-18
