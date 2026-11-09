# w322 C23: the dispatch admits what the project's configuration names (held patch, PARTIAL)

Closest criterion: AC-108. PRD and Spec unchanged. Base: the integration state of candidate 23 (clone commit 982f9e73f, with the w321 reader slice
in it). Clone commit of this slice: ffb0a5ad5. Status: checkpoint, not complete. Decisions 5 and 6 of
`docs/adr/draft-project-routing-is-user-owned.md` are delivered for the briefing generator, the dispatch guard, the projection and the route source;
the SubagentStop wiring of the effort observation and the dispatch-record path are open (see Not proven).

## What

- `scripts/dispatch-briefing.mjs`: `DBG-EFFORT-ROUTE-CONTRADICTION` no longer refuses. A configured Claude effort that differs from the frontmatter is
  admitted: the binding records the route's effort, the warning `DBG-EFFORT-ROUTE-DIFFERS` names both and the older-host case. The MP-05/MP-07
  escalation branch is unchanged. The Claude branch of `DBG-MODEL-FAMILY` refuses only a model of another provider's family (`gpt`, `chatgpt`, `codex`,
  `gemini`, `o<digit>`); any other Claude id or alias builds, a family differing from the agent definition warns `DBG-MODEL-DIFFERS-FROM-AGENT`. The Codex
  and Antigravity branches are untouched, so a Claude model there stays refused. `dispatchCall` carries `effort` next to `model` (build and probe); a full
  model id maps to its family alias with `DBG-MODEL-ALIAS-ONLY`; an id with no family is named as configured with `DBG-MODEL-NO-FAMILY`.
- `lib/dispatch-model-enforcement.mjs`: `selectorMatches` admits a family alias for a configured `model-id` selector of that family; `evaluateDispatchModel`
  takes `effort` (admitted; one the duty's configuration does not name warns `DISPATCH-EFFORT-DUTY-MISMATCH`; a call without a model is still refused);
  tolerated route conflicts are returned as warnings. New pure `observeEffectiveEffort({ configuredEffort, stopInput })`: `effort.level` present ->
  observed (warns `DISPATCH-EFFORT-NOT-EFFECTIVE` if it differs), absent -> `unobserved`, no effort claimed (`DISPATCH-EFFORT-UNOBSERVED`). `hooks/guard-dispatch.mjs`
  passes `toolInput.effort`.
- `lib/model-role-route-source.mjs`: `registeredFunctionalTaskRoutes(registry, { tolerateConflicts })` keeps the refusal by default (shipped registry, bootstrap
  callers); `projectFunctionalTaskRoutes` tolerates it: the first cell stays the bootstrap slot, every task route keeps its selector, `warnings` carries
  `MODEL-ROLE-ROUTE-SOURCE-CONFLICT` (stderr once per process when no `warn` is passed).
- `lib/runtime-projection-v3.mjs`: a Claude selector outside `nativeModelAliases` projects as given.
- `policies/model-policy.md` MP-29 item 3 names the effort parameter next to the model parameter. The vendored canon generator ran in the clone: 0 files
  written, `--check` passes (MP-29 has no vendored copy).
- Tests first, shown RED: DME-C23b/c/d, GD2-C23a/b/c (b RED), C23 dispatch-briefing cases (effort, model id, other provider), runtime-projection C23,
  model-role-session MRS35 (conflict). Restated in place with QG-04 comments: seven dispatch-briefing pins that required the refusals (REFUSALS row, K142,
  17 Gemini, A18-M1B prefixes, W2-R2 contradiction, W2-R2 lower pin, package parity); count pins 39 -> 41 (model-role-session), 85 -> 88 (guard-dispatch).
- Item 8 (seed readers): MRS36 shows a project whose route differs is not refused by `registeredFunctionalTaskRoutes()`, `modelRoleRouteSourceSha256()` and
  `readModelRoleApprovedPolicy`: they read the registry, never the project, with and without the project file their answers are identical. No reader rewired.

## Why

PO direction: everything follows the user's `pipeline.user.yaml`; the dispatch admits it. The Agent tool's per-invocation `effort` overrides the frontmatter
(Claude Code v2.1.292+, not observed live).

## Not changed

`critic_export`, the advisory contract, the requirement that a dispatch names its model, the Critic preimage and its pinned files, the bootstrap /
approved-policy / elephant-agy readers, `pipeline.user.yaml`, `pipeline.yaml`.

## Not proven / open

- Green in the clone (second step, commit bea556f0d): dispatch-model-enforcement (19), model-role-session (41), runtime-projection-v3 (1), dispatch-briefing (173),
  guard-dispatch (88), guard-dispatch-native-worker (9), check-routing-projections (1), kernel closure (1). The check test of this slice: 2 pass.
- Item 4 wiring delivered: `hooks/native-goldfish-host.mjs` exports `effortObservationNotice`; on the Claude SubagentStop path beside a recorded Goldfish commit
  it prints on stderr either the observed `effort.level` (warning when it differs from the configured effort read from the written dispatch record) or
  `DISPATCH-EFFORT-UNOBSERVED`. Case DME-C23e (RED first, then green). The closed v4 dispatch record and the host observation receipt have no field for an
  observed effort, so the observation is a stop-time message, not a record field; adding one is a schema change this slice did not make.
- Open, blocks a real chain: `scripts/dispatch-record-write.mjs` line 379 (native Claude opening) requires `compareRecordedModel(expected)` to be
  `model-matches` against the agent frontmatter, and `scripts/dispatch-authorship-verify.mjs` classifies the record the same way. A binding whose model family
  or effort differs from the frontmatter (now buildable) would fail `record-model` at the host commit. `lib/agent-model-registry.mjs` `compareRecordedModel`
  needs the project's configured route (or a declared `modelOverride`). Also `NGHR-CLAUDE-RETURN-MODEL` requires `resolvedModel === binding.model`, which a
  full id mapped to a family alias may not satisfy on the foreground route. Both need a decision; not changed.
- No live observation of the effort parameter or of `effort.level`; the test-first evidence file via the redacting writer was not produced.
