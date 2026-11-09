# Draft ADR: A project's `pipeline.user.yaml` owns its model and effort routing

> Agent-Pipeline · Sprint Alfred · 2026-11-09

**Status:** proposed; PO direction given, implementation pending. ADR numbering is deferred under ADR-0069 until acceptance.

**Context source (verbatim PO direction, 2026-11-09):** "es soll eigentlich immer alles der pipeline.user.yaml folgen! das muss konfigurierbar für jeden user sein, keine harten vorgaben sowas muss aus der config kommen und der dispatch dann alles zu lassen".

## Context

A Claude greenfield run was refused `DBG-EFFORT-ROUTE-CONTRADICTION` on `goldfish-deep` and moved a safety fix to a lower tier. The refusal's repair says to change the route in `pipeline.user.yaml`, but that repair cannot work:

- `validatePipelineUserV3` compares `routing` byte for byte with the plugin's frozen registry, so a changed route makes the project configuration invalid.
- The dispatch route readers default to `loadRunnerProfilesV3Registry()`, so they never read the project's configuration.
- `refreshKnownV3RegistryDelta` replaces `routing` wholesale, so a project value would be lost on the next refresh.

On Claude the frontmatter `effort` of an agent definition decided the effort until the Agent tool gained a per-invocation `effort` parameter. The Claude Code documentation states that this parameter overrides the frontmatter field, that `CLAUDE_CODE_EFFORT_LEVEL` beats both, that it applies to non-fork subagents, and that it needs v2.1.292 or later. This has not yet been observed on the runners.

## Decision proposed

1. `routing` in `pipeline.user.yaml` is project-owned. The plugin registry is the seed for a new project and the source for cells a project does not have.
2. Validation checks the shape only: the closed set of profiles, phases, duties and runners, the cell keys, the state, selector kind and effort enumerations, and a non-empty selector value. Any model id or alias and any listed effort is valid.
3. A refresh is additive: it fills missing cells from the registry and never overwrites a value the project holds.
4. Every reader that selects a route for a run reads the project's validated routing. A missing or invalid configuration falls back to the registry and says so.
5. The dispatch admits what the configuration names. A model or effort differing from an agent definition's own pin is not a refusal. The requirement that a dispatch names its model stays, so nothing inherits the session's model silently.
6. On Claude the generated dispatch call carries the configured `effort`. Where it cannot take effect, the dispatch warns and records the effort that really runs; it does not refuse.
7. The shipped registry default for `duties.deep.claude` becomes `high` (PO tile 2026-11-09, D184). Existing projects keep their value.

## Consequences

A user can configure a weaker model or a lower effort for any duty, the Critic included. `pipeline.user.yaml` stays a gate-strength file, so an agent cannot change it without the human override route. Projects can diverge from the shipped matrix, so a report about model or effort has to read the project's configuration. The Critic preimage pin is unchanged; the Critic's route reaches it through the tool-layer `model` parameter.

## Affected contracts

ADR-0038 ("the V3 route/fallback registry remains frozen") stays true for the shipped registry file, not for a project's copy of its routes. MP-29 gains the effort parameter next to the model parameter.
