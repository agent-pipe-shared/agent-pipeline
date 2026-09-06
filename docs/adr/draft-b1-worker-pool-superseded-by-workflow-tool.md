# ADR-{{NNNN}}: Nova B's own parallel worker-pool capability is superseded by the runner's Workflow tool

> Agent-Pipeline · Sprint Nova-B · as of 2026-09-06

**Status:** proposed — records a PO decision given live on 2026-09-06;
numbered only at acceptance of this ADR's text per
[ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2. Until
then this file is `docs/adr/draft-b1-worker-pool-superseded-by-workflow-tool.md`.

**Basis:** `specs/sprint-nova-epic/prd_sprint-nova-epic.md` §"B1. Supervised
local worker pool — `#21`" and `specs/sprint-nova-epic/acceptance.md`
§"`#21` Local worker pool", criteria NVA-B21-1, NVA-B21-6 and NVA-B21-9.

## Context

Nova B requirement B1 (`#21`) specifies a supervised local worker pool: the
Pipeline's own mechanism for running more than one Goldfish concurrently on
one host, with capacity computed from certified/observed units, reserved
Elephant/Verify/Critic capacity, per-worker workspace and authority leases,
heartbeat, cancellation, timeout, orphan expiry and stale-result rejection.

Its deterministic local contract is built and green
(`local-worker-supervisor.test.mjs`, `local-worker-pool.test.mjs`), but the
Issue is held open by its own acceptance text. NVA-B21-9 states it plainly:

> Fixture-process evidence proves only the local supervisor mechanism. Pool
> capability and Issue `#21` remain open until a separately activated
> same-host observation proves at least two provider-backed Goldfish workers
> under one candidate, fixture set and resource envelope.

and NVA-B21-6 adds that pool capability may be advertised only after at
least two workers are certified and observed.

No such live, provider-backed multi-worker observation exists anywhere in
the repository. Producing one is not a small step: it means standing up real
concurrent provider-backed workers on a real host, with certification and
observation evidence, on top of a contract layer that is already complete.

Meanwhile the runner itself gained a Workflow tool that performs
deterministic multi-agent orchestration — parallel and pipelined fan-out
across subagents, with phases and result collection — as a platform
capability, outside this repository's own code.

## Decision

**The remaining B1/`#21` work is discarded. Nova B does not build, certify or
live-prove its own parallel worker-pool capability. The runner's Workflow
tool is accepted as covering that need.**

PO decision, given live 2026-09-06, verbatim: *"B1: das verwerfen wir, da
dass neue workflow tool dies bereits selber sehr gut macht und wir es nicht
nachbauen müssen"* ("B1: we discard this, since the new Workflow tool
already does this very well itself and we do not need to rebuild it").

Consequences of that decision, stated explicitly so the record and the
built thing do not diverge:

1. NVA-B21-1 (a conflict-free wave larger than runner-native fan-out),
   NVA-B21-6 (advertise only after two certified/observed workers) and
   NVA-B21-9 (the separately activated same-host multi-worker observation)
   are **withdrawn as delivery obligations**. They are not "still open"; they
   are no longer required.
2. Nova B makes **no advertised concurrent-pool capability claim** at all.
   That is not a downgrade forced by missing evidence — it is the decided
   scope. Any future document that describes the Pipeline as providing its
   own worker pool is wrong and should cite this ADR.
3. Parallel execution of independent work is, from here, the **runner's
   Workflow tool's** job. How an Elephant session is made to actually reach
   for it by default is a separate, still-open problem tracked at
   `backlog/items/2026-08-29-the-pipeline-defaults-to-sequential-work-with-no-enforced-task-slicing.md`
   — this ADR does not solve that and must not be read as solving it.

## Decision, amended 2026-09-06 (later the same day): the discard does NOT extend to Codex

The Decision above was taken on the understanding that the Workflow tool
covers the need. That is true **for Claude Code**. It is false for the other
runners, and the PO caught this within the hour:

> "es könnte für codex und agy aber wichtig sein es wirklich in den einsatz
> zu bringen oder?"

Three facts, all verified from source after that question:

1. **The supervisor already carries a real Codex adapter, deliberately
   switched off.** `plugins/pipeline-core/lib/local-worker-supervisor.mjs`
   accepts two runner kinds, `"fixture"` and `"codex-exec"` (line 162), with
   Codex-specific JSONL output validation (line 833) and a
   `providerExecutionRequired` marker (lines 591, 621). Activation is gated
   by one function parameter defaulting to false (line 1095):
   `if (request.runner.kind === "codex-exec" && !allowProviderExecution)
   return { ok: false, code: "LWS-PROVIDER-ACTIVATION-REQUIRED" }` (line
   1102). This is a finished, gated capability, not a stub.
2. **Codex has no working delegation path at all today.**
   `backlog/items/2026-08-29-codex-worker-subagent-dispatch-capability-is-broken.md`
   (open) records a real Codex run in which BOTH dispatched worker sessions
   failed with `repository-control-path-invalid` /
   `session-capability-unavailable`, making "the entire Goldfish-dispatch
   model practically unusable in the Codex runner".
3. **The Workflow tool is a Claude Code feature.** It does not exist for
   Codex or Antigravity.

Taken together: for Codex, the supervisor is not a redundant rebuild of the
Workflow tool — it is the only mechanism in this repository that could
execute delegated work at all, because it spawns its own child processes
(`node:child_process`) instead of relying on the runner's own subagent
mechanism, which is precisely what is broken there.

**Amended decision:** the discard stands **for Claude Code only**. The
supervisor surface is retained. Nova B still makes no advertised
concurrent-pool capability claim, and NVA-B21-1/6/9 stay withdrawn as
delivery obligations — but the code is kept as the runner-neutral execution
path, and the open question is no longer "retire or keep" but "switch on for
Codex, and at what scope".

**The cheapest next step is a probe, not a build.** `allowProviderExecution`
is one parameter at one call site. Passing `true` once, against a real
Codex worker, answers whether this path works at all — the same shape as the
`additionalContext` channel probe run the same day. That is materially
smaller than NVA-B21-9's original bar (two concurrent provider-backed
workers observed on one host), and it must not be reported as satisfying it.

## What this decision does NOT do

- It does **not** remove the already-landed B1-I local supervisor code or its
  green contract tests — see the 2026-09-06 amendment above, which settles
  this: the surface is retained as the runner-neutral execution path. The
  question that replaced it is the probe scope for `codex-exec`.
- It does **not** touch B2 (`#16`/`#18`) or B4 (`#51`). Those have their own
  separate remaining questions.
- It does **not** claim the Workflow tool has been certified against this
  repository's own `#7` runner-conformance matrix. It has not been. The
  decision is that Nova B does not need its own pool, not that the Workflow
  tool has passed Nova's conformance bar.

## Alternatives considered

- **Produce the live two-worker observation anyway.** Rejected by the PO on
  redundancy grounds: it would certify a mechanism whose job the runner
  already performs, at real cost (a live provider-backed multi-worker run
  plus its certification evidence), for no capability the project would
  actually use afterwards.
- **Leave `#21` open indefinitely without deciding.** Rejected implicitly by
  making the decision: an Issue held open by an obligation nobody intends to
  discharge is indistinguishable, from repository state alone, from one that
  is merely behind — the exact failure mode
  `backlog/items/2026-08-27-resolved-backlog-items-can-keep-status-open-indefinitely.md`
  already records for this repository.

## Follow-up

- Amend `specs/sprint-nova-epic/acceptance.md`'s `#21` section so
  NVA-B21-1/6/9 are marked withdrawn-by-this-ADR rather than silently left
  as unmet criteria.
- Answer the open question above on the fate of the existing B1-I local
  supervisor surface.
