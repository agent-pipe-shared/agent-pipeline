# The first live Codex supervisor probe — blocked, and what it still established

PO-approved (decision #7, 2026-09-06): one live exercise of
`local-worker-supervisor.mjs`'s never-executed `codex-exec` path with
`allowProviderExecution: true`.

**Outcome: the live execution did not happen.** The runner's auto-mode
permission classifier denied the spawn pre-execution. The dispatch stopped
rather than reshaping the invocation, which is the correct response — a denied
call means the permission decision stands, and hunting for a shape that slips
past it is exactly the laundering this repository forbids.

## The diagnostic is the useful part

The classifier **permitted** the probe's dry-run path, which itself shells out
to `codex --version` and `codex exec --help` through `observeRunner`. It
**denied** the same script once `runLocalWorkerSupervisor` reached the real
`codex … exec … --sandbox danger-full-access … -` spawn.

So the denial is not about Codex, and not about the probe. It targets that
specific spawn shape. That narrows the unblock precisely: a Bash permission
rule for that invocation, or a session outside this classifier's scope.
Neither is a Pipeline change — no guard, no supervisor edit, nothing in this
repository is wrong.

## What the attempt did establish, which was not known before

`planLocalWorkerSupervisor` returned **`LWS-PLAN-READY`** for a real
`codex-exec` request. Until today nothing had ever built one: the only
production caller runs fixture mode, and every test that touches the
`codex-exec` branch stops at launch-shape assertions.

So the request validators, the plan digest, and
`providerExecutionRequired: true` are now known to accept and describe a real
provider request end-to-end up to the spawn boundary. That is one link of the
chain converted from untested to exercised. The remaining untested link is the
spawn itself and everything after it — result parsing, `validCodexJsonl`,
record cleanup.

## Probe parameters, recorded so a rerun is identical

- One worker, no pool.
- `timeoutMs: 60000`.
- `maxOutputBytes: 65536` — deliberately not the floor. `appendBounded()`
  (`local-worker-supervisor.mjs:920-924`) force-kills the worker on overflow,
  which would have masked the `validCodexJsonl` observation the probe exists
  to make. A too-small buffer would have produced a failure that looked like a
  transport defect.
- `stateRoot` under `scratch/`, with `XDG_STATE_HOME` overridden and asserted
  by prefix.
- Instruction, fixed and trivial: reply with one line naming the model; read,
  write and modify nothing; run no command.
- `model: gpt-6-astra`, `effort: low` — chosen by the dispatch, disclosed;
  the briefing left them open.

## Cleanup verified

`pgrep -af codex` showed only pre-existing unrelated processes. `git status
--short` empty. No state outside `scratch/`.

## Why the sandbox choice deserves a second look before a rerun

The supervisor builds its Codex launch with `--sandbox danger-full-access`,
and its own tests pin that as deliberate: *"uses the host-boundary sandbox for
real Codex worker dispatch, never workspace-write"*. The classifier's refusal
is therefore not obviously wrong — it is declining to let an agent put a
full-access provider process on the host without a human in the loop.

Recorded as a question rather than a finding, because answering it is a
design decision and not this probe's business: is `danger-full-access` the
right posture for a worker whose whole purpose is bounded, workspace-scoped
edits? The tests say it was chosen on purpose. Nothing here shows the reason.
