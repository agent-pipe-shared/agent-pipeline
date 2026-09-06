# PO decisions, 2026-09-06 (given from mobile)

## #4 — Attribution conflict: GIT-03 stands

**Decision:** commits carry `AI-Assisted: true` and nothing else identifying.
The session-level reminder asking for `Co-Authored-By` and a `Claude-Session:`
URL does NOT apply in this repository.

This confirms the behaviour the guard already enforces and that a dispatch
independently defended today when it refused to add those trailers. GIT-03's
"there is no override" is now a PO-confirmed decision rather than only a
guard's opinion — which matters, because until now an agent following it was
doing so against a live instruction with no authority to settle the conflict.

**Consequence:** no code or guard change. The conflict is closed, not
worked around. Any future session seeing that reminder should follow GIT-03
and cite this decision.

## #6 — GitLab evidence for B2/B4: deferred by the PO

The PO will supply the project reference later. **Nothing about B2/B4 may be
described as live-tested in the meantime** — this repository still holds no
durable trace of that run, and the deferral does not change that.

## #7 — B1/Codex live provider probe: APPROVED

One live execution of `local-worker-supervisor.mjs` with
`allowProviderExecution: true` at one call site, against a real Codex worker.

`codex-cli 0.153.4` is reachable at `~/.local/bin/codex`.

**Attempted 2026-09-06 and BLOCKED — the approval was not enough.** The
runner's auto-mode permission classifier denied the `codex … exec … --sandbox
danger-full-access` spawn pre-execution, while permitting `codex --version`
and `codex exec --help`. The dispatch stopped instead of reshaping the call.

The approval stands; what it cannot grant is the runner-level permission. To
actually run it the PO must either add a Bash permission rule for that exact
invocation, or run the probe from a session outside this classifier's scope.
Nothing in this repository needs to change.

Established anyway, and new: `planLocalWorkerSupervisor` returns
`LWS-PLAN-READY` for a real `codex-exec` request. That path had never been
built before. Detail:
`backlog/evidence/2026-09-06-lws-live-probe-blocked.md`.

## #8 — Real end-to-end Codex Critic review run: APPROVED

The fifth acceptance criterion of the Alfred handover.

**Ordering constraint the approval does not remove:** criteria 1–4 (the
host-side consumer that reads `execution.launch`, launches the Critic under
the selected sandbox profile, and writes back `execution.result`) do not exist
yet. There is nothing to run end-to-end until that is built. So #8 is
approved-and-queued behind its own prerequisite, not approved-and-doable.
