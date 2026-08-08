---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-seeded-with-private-overlay-calibration
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "Found by the CLAUDETIER-1 dispatch of 2026-08-08 while measuring what a fresh seed leaves under .claude/; the dispatch was investigating a different question and stopped on this."
---

# Every new project is seeded with the private overlay's calibration

## What a fresh project actually gets

Ordinary greenfield onboarding — the `initialize-runtime` step, on a plain
project with no overlay and no Codex mount — writes `.claude/pipeline.json`
containing:

```json
{
  "project": "agent-pipeline-private-overlay",
  "verify": "git diff --check HEAD",
  "stakes": "private-overlay",
  ...
}
```

That is the **private overlay's** calibration, seeded into a project that is not
an overlay. Two things in it are wrong for a consumer project, and the second is
the dangerous one:

- `project` names a different repository. A calibration that identifies itself as
  another project is a false statement in a governed artifact.
- `verify` is `git diff --check HEAD`, which checks for whitespace errors and is
  green on essentially any tree. A verify contract that cannot fail is worse than
  an absent one, because the gate that reads it reports success.

The neutral tier is correct in the same run: `project/pipeline.json` carries the
honest placeholder that deliberately fails until a real command is configured. So
a fresh project ends up holding two calibrations that disagree about whether its
verify gate can fail.

## Why it happens

- `plugins/pipeline-core/lib/runner-profile-migration-v3.mjs:108` —
  `SLIM_V3_RUNTIME_SEEDS` carries the overlay calibration. Its own comment scopes
  it correctly: *"A private overlay is itself a governed project. Seed the
  complete portable calibration so a freshly activated overlay satisfies the same
  F4 bootstrap contract."*
- `plugins/pipeline-core/lib/runner-profile-migration-v3.mjs:267` — the seed set
  is selected by `initializeSlimV3`, which is `sourceKind ∈ {v3, v3-refresh}` and
  the caller's `initializeMissingRuntimeForSlimV3` flag.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:3726` and `:3795` — pass
  `initializeMissingRuntimeForSlimV3: operation === "runtime"`.

So the flag is not set for overlays specifically. It is set for **the ordinary
runtime-initialization operation of any V3 project**, and a fresh consumer project
is a V3 project. The name reads like an overlay special case; the condition is a
general one.

Corroborating evidence that this was not intended: the neighbouring
`LEGACY_V3_RUNTIME_SEEDS` (`:89`) seeds `.claude/pipeline.json` as `{}` and its
comment says in as many words *"Do not reuse the Slim Overlay calibration here; a
legacy project must derive its public runtime projection from its source."* The
legacy path was protected against exactly this; the V3 path was not.

## Blast radius, stated honestly

The active harm is bounded by which tier the calibration resolver reads. In the
observed 2026-08-08 greenfield run the confirmation line reported
`calibration project/pipeline.json`, i.e. the neutral tier won and the overlay
calibration sat unread. So this is a latent defect in that configuration, not an
observed always-green gate.

It stops being latent wherever the legacy tier resolves first — an older project,
a differently ordered resolver, a tool that reads `.claude/pipeline.json` by
name — and the failure mode is silent success rather than an error.

Not yet established, and worth establishing before the fix is designed: whether
any shipped reader resolves the legacy tier ahead of the neutral one today.

## Relationship to the `.claude/` tier decision

The PO's rule of 2026-08-08 — Claude-owned files may live under `.claude/`,
Pipeline-owned files may not — would remove this file from a fresh project and
therefore remove this defect as a side effect. That is not a reason to fold the
two together:

1. The tier removal is blocked. `.claude/pipeline.json` and `.claude/pipeline.yaml`
   are declared runtime targets in
   `plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json`, and the
   plugin fails closed on an absent declared runtime target, so a project without
   them never reaches `ready`. Removing the write requires changing the manifest
   and the fail-closed readers.
2. The wrong *content* is independently wrong and much cheaper to fix. As long as
   the file is written, it should not claim to be another repository with an
   unfailable verify contract.

## Direction, not a design

1. **Separate the two seed sets by intent, not by operation.** A private overlay
   activating itself and a consumer project initializing its runtime are different
   callers; only the first should receive the overlay calibration.
2. **Give the consumer path the same honest placeholder the neutral tier uses**,
   so the two tiers agree that verify is unconfigured and must fail.
3. **Pin it.** A check that a seeded consumer project's calibration contains
   neither `agent-pipeline-private-overlay` nor a verify command that passes on an
   arbitrary tree. Without it this is a one-line regression.
4. **Then establish resolver order** (the open question above) and record whether
   the latent case was ever reachable, so the severity is on record rather than
   assumed.

## Triggering situation

Any fresh consumer project, local `0.5.4+claude` build, at the
`initialize-runtime` step. Not observable in this repository, which is past that
step and carries its own calibration.

## Related

- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md` —
  same onboarding path, same greenfield run class.
- [ADR-0054](../../docs/adr/0054-arbitheon-authority-directory-and-precedence-chain.md)
  — the three-tier precedence chain whose legacy tier this file belongs to.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
