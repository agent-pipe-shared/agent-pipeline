---
schema: pipeline.backlog-item.v1
id: pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO explicit follow-up 2026-08-30 after live-diagnosing the Codex worker session-capability failure: this has recurred across multiple prior Codex sessions, and a bootstrap-time sandbox-profile query/selection was discussed before but never wired up."
source: "PO, 2026-08-30: 'das hatten wir ja schon bei vielen themen mit codex und da sollte dann aber immer automatisch als folge schritt eine anweisung sein, dass bei diesen fehler eine andere art der sandbox nötig ist! dazu hatten wir eigentlich schon mal ein extra profil konfiguriert aber das muss halt auch im bootstrap abgefragt werden und dann anders starten.'"
---

# Codex worker dispatch hardcodes `--sandbox workspace-write`, which blocks the child-process spawns the Pipeline's own repository validation needs

## What happened

Closed item
`2026-08-30-codex-worker-dispatch-fails-session-capability-probe-root-does-not.md`
confirmed the root cause of a Codex worker failing
`repository-control-path-invalid`/`session-capability-unavailable`: Codex's
sandbox blocks child-process spawning (`EPERM`) in the worker's tool-calling
context, and `validateLocalRepository()`
(`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`) spawns
`git` subprocesses as part of its repository-topology validation, which
runs BEFORE the session-descriptor probe.

The PO's follow-up: this specific failure class has recurred across
multiple prior Codex sessions/themes, not just this one greenfield test. A
different, less-restrictive sandbox profile was apparently configured
before for exactly this kind of situation, but nothing at bootstrap time
detects the need for it or offers/selects it automatically -- the worker
just launches with the same fixed sandbox mode every time and fails the
same way every time.

## Where this actually lives

`plugins/pipeline-core/lib/local-worker-supervisor.mjs` spawns Codex
workers with a hardcoded `--sandbox workspace-write` (two call sites,
~line 451 and ~line 760, the second also pinning
`sandbox_workspace_write.network_access=false`). There is a SEPARATE,
narrower sandbox-mode-selection mechanism already built
(`plugins/pipeline-core/scripts/codex-sandbox-select.mjs`), but it is
scoped ONLY to `advisory`/`readiness`/`critic` duties (Advisor
consultation), not to general worker/implementation dispatch -- it does
not cover this case.

## Confirming context, 2026-08-30 (Codex's own live analysis)

Asked live (via the PO) why an alternative sandbox profile "should" have
avoided this EPERM but apparently did not fire, Codex's own reasoning
converged on the same location this item already names: either (2) the
active profile is enabled but does not permit `child_process`/`/bin/sh`
spawns, or (3) the worker still inherits the restrictive default profile
instead of the intended alternative one. Root and worker both failing
identically against the same `.git` is cited as evidence favoring (2)/(3)
over a worktree-specific problem. This matches
`local-worker-supervisor.mjs`'s hardcoded `--sandbox workspace-write` at
both spawn call sites exactly -- no code path there currently selects a
different profile at all, so both (2) and (3) reduce to the same fix
location this item already proposes.

## Proposal

At worker-dispatch bootstrap time (before launching a Codex worker via
`local-worker-supervisor.mjs`), detect or query whether the fixed
`workspace-write` sandbox mode is going to block the repository-validation
git-spawn this Pipeline needs, and if so, select/request the alternative,
less-restrictive profile the PO recalls having configured before, rather
than launching into a predictable failure every time. This likely needs:
1. Locating whatever "extra profile" the PO is recalling (grep Codex's own
   config, `~/.codex/`, or prior session notes/ADRs for a previously
   configured alternative sandbox mode -- not found yet in this repo's own
   tracked files).
2. A bootstrap-time check/query (mirroring the existing
   `codex-sandbox-select.mjs` pattern's discipline: closed, model-free,
   fully read-back) that decides which mode to launch a worker with.
3. Wiring that decision into `local-worker-supervisor.mjs`'s two spawn call
   sites instead of the current hardcoded literal.

## Acceptance criteria

- A Codex worker dispatch against a real repository no longer fails the
  session-capability probe due to sandbox-blocked git-spawn, either by
  selecting a working sandbox mode automatically or by surfacing an
  explicit, actionable bootstrap-time question/decision rather than a
  late, opaque runtime failure.
- The existing `workspace-write` default is not weakened for cases that
  don't need this -- the alternative mode is selected only when actually
  required, following the same "closed, narrow, fully read-back" discipline
  `codex-sandbox-select.mjs` already established for its own narrower scope.

## Related

- `2026-08-30-codex-worker-dispatch-fails-session-capability-probe-root-does-not.md`
  (closed) -- the live diagnosis this item's fix location was found from.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized, recurring defect across multiple prior
  Codex sessions per the PO's own account, not a one-off
- **Date:** 2026-08-30
