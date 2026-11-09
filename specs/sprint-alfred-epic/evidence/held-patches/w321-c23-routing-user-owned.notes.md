# w321 C23: a project's pipeline.user.yaml owns its model and effort routing (held patch, PARTIAL)

Closest criterion: AC-108. PRD and Spec unchanged. Base: the integration state of candidate 23 (clone commit 191b1714f). Status:
checkpoint, not complete. Decisions 1, 2, 3 and 7 of `docs/adr/draft-project-routing-is-user-owned.md` are delivered; decision 4
is delivered for the dispatch guard and the briefing generator and still open for the other readers listed below.

## What

- `runner-profiles-v3.mjs`: `validatePipelineUserV3` no longer compares `routing.profiles` and `routing.duties` with the registry.
  It checks the shape: the closed sets of profiles, phases, duties, runners and cell keys, `state`, `selector.kind` and `effort`
  enumerations (low, medium, high, xhigh, max, not-applicable), a non-empty `selector.value`; any model id or alias is valid. The
  cell fields that are neither model nor effort (`unavailable`, `evidence`) still equal the registry's. The advisory duty keeps its
  frozen contract (exact compare); `critic_export` is untouched.
- Same file: `readProjectRouting(root)` returns `{ source, routing, warnings }` (the project's validated routing, or the registry
  with a warning when `pipeline.user.yaml` is absent, unreadable or invalid; the one yaml-lite parser, `path.join` so a drive-letter
  backslash root works). `loadProjectRoutingRegistry(root, { warn })` returns the registry with the project's routing substituted
  and announces a fallback once on stderr (or through `warn`). `fillAbsentRouting` and a `refresh` field on the `routing` entry of
  `CORE_OWNED_V3_SURFACES` make the refresh additive.
- `runner-profile-migration-v3.mjs`: the refresh fills absent duties, profiles and runner cells and keeps every value the project
  holds; the advisory duty is restored from the registry (frozen contract). The read-duty predecessor branch no longer demands an
  exact routing; the outgoing registry digest 20ee1ddb... joins `KNOWN_OLDER_REGISTRY_SHA256`.
- `model-role-route-source.mjs`: `projectFunctionalTaskRoutes(root, { warn })`. `dispatch-model-enforcement.mjs`:
  `evaluateDispatchModel` takes `root` (default route source = the project's) and reports a fallback as a warning;
  `guard-dispatch.mjs` passes the project root. `dispatch-briefing.mjs`: `defaultClaudeRoute`, `defaultCodexRoute`,
  `defaultAntigravityRoute`, `defaultAntigravityRouteModel` read the project's routing for `root`.
- Registry default `duties.deep.claude.effort` is `high` (registry digest now 4514c3fd...); the clone's `pipeline.user.yaml` follows
  (the effort line and the `core_registry_sha256` line, which the validator ties to the registry file). The approved-matrix pin in
  `runner-profiles-v3.test.mjs` is restated in place with a comment.
- Tests added first and shown RED: `runner-profiles-v3.test.mjs` (shape, refusals, reader, fallback, backslash root, new default),
  `runner-profile-migration-v3.test.mjs` (RPM41, RPM42; corpus count 61 -> 63), `dispatch-model-enforcement.test.mjs` (DME-C23).
  Six migration cases that pinned the wholesale refresh (RPM06, RPM07, RPM16, RPM17, RPM38, RPM40) are restated in place, each with a
  QG-04 comment: a changed value is now the project's own and survives the refresh.

## Why

A Claude greenfield run could not repair `DBG-EFFORT-ROUTE-CONTRADICTION` by changing the route in `pipeline.user.yaml`: the
validator pinned routing to the registry, readers ignored the file, the refresh overwrote it. PO direction: everything follows the
user's configuration.

## `loadRunnerProfilesV3Registry()` call sites (non-test source)

Selecting a route for a run (must read the project):
- DONE: `scripts/dispatch-briefing.mjs` (via `projectFunctionalTaskRoutes`), `lib/dispatch-model-enforcement.mjs` / `hooks/guard-dispatch.mjs`,
  `scripts/model-role-dispatch-select.mjs` (default registry = the project's for `rootDir`; an injected registry is still validated
  against the frozen contract), `scripts/critic-dispatch-preflight.mjs` (651, the Opus Critic prompt lines; its closed stderr protocol
  gets no fallback warning, deliberately), `scripts/critic-claude-host.mjs` 185 (the Claude Critic route, read for the packet's checkout).
- Seed only after reading them: `scripts/critic-claude-host.mjs` 162/317/378 and `scripts/codex-critic-packet-host.mjs` 67/187 use the registry
  only for `criticExportPolicy` (exact, Core-owned), so they stay.
- DONE (fourth step): `scripts/goldfish-antigravity-host.mjs` (341) and `lib/agy-session-dispatch.mjs` (645) read the project's routing for
  their `root` (an injected registry is still validated against the frozen contract); `lib/main-session-route.mjs` (95) stays a pure kernel
  that takes `registry`, and its only caller `hooks/post-compact-reground.mjs` now passes the project's registry for its root.
- STAYS, decision for the coordinator: `scripts/elephant-agy-implementation-dispatch.mjs` (52). `routeAuthority` is an approval pin: it
  accepts only the PO-approved constants (model, effort, opt-in, digest-bound policy) and refuses anything else, so reading a user's route
  there would only turn a changed route into a refusal. It is the one reader in the briefing list left on the seed; opening it means
  deciding whether the constants stay a pin.
- OPEN, decision needed: `registeredFunctionalTaskRoutes()` default callers `lib/role-dispatch-preflight.mjs` (421),
  `scripts/model-role-bootstrap.mjs` (183, 310), `lib/model-role-host-session.mjs`, `lib/model-role-host-observations.mjs`,
  `lib/model-role-dispatch.mjs`. They feed bootstrap admission and an approved-policy hash (`model-role-approved-policy.mjs`), so a
  project route there changes what the approval covers.

Seed or shape only (stay): `lib/project-onboarding-v3.mjs` (1277, new project seed), `lib/runner-profile-migration-v3.mjs` (456 seed for a
v2 conversion, 484 additive refresh source), `lib/runtime-projection-v3.mjs` (896, 911 validation seed), `lib/critic-export-policy.mjs`
(235, exact `critic_export` policy), `lib/project-uninstall.fixture.mjs`, `lib/model-role-approved-policy.mjs`,
`lib/model-role-v3-baseline.mjs`, `lib/model-family-route-source.mjs`, `lib/design-decision-bindings.mjs`,
`scripts/model-family-approval-request.mjs` (historic approved sources). Advisory readers (`lib/advisory-coordinator.mjs` 274,
`lib/advisory-lifecycle-v2.mjs` 331/384/440, `scripts/advisory-host-bridge.mjs` 841, `lib/design-advisory-coordinator.mjs` 133,
`scripts/design-advisory-coordinator.mjs`, `lib/design-advisor-course-store.mjs`, `lib/design-advisory-coordinator-v2.mjs`,
`lib/native-initial-advisor-execution.mjs`, `scripts/codex-design-advisor-host.mjs`): advisory is validated exactly against the
registry, so the project's advisory duty equals the seed; they can stay on the seed until the advisory contract itself is opened.

## Not changed

- `DBG-EFFORT-ROUTE-CONTRADICTION`, `DBG-MODEL-FAMILY` and the Claude `effort` parameter (next slice). `critic_export`, the advisory
  contract, the requirement that a dispatch names its model, the Critic preimage and its pinned files.
- `check-routing-projections.mjs`: it already plans the projection from the project's own validated intent (the advisory cell is read
  from `user.routing`); with the validator shape-based it now compares with the project's intent, so no code change was needed. Its
  static agent-frontmatter part (`ROUTING_AUTHORITY`) is unchanged.

## Not proven / follow-up

- NOT GREEN: `check-routing-projections.test.mjs` fails in the clone, and `check-routing-projections.mjs` prints "`.claude/pipeline.yaml` and
  `project/pipeline.yaml` V3 owned projection drift": both derived files carry the old `deep.claude` effort. They are outside this slice's
  file scope; the fix is the derived-file refresh (`refresh-derived-files`), which the briefing forbade.
- A Claude selector outside the native catalog (`nativeModelAliases` of the owned-key manifest) is valid in `pipeline.user.yaml` but is not
  projectable: the runtime projection plan stops with `invalid-baseline` ("V3 Claude selector is not natively projectable"). Needs a
  decision (extend the catalog, or project a model id as given).
- `registeredFunctionalTaskRoutes` returns `MODEL-ROLE-ROUTE-SOURCE-CONFLICT` when two cells with the same runner, role and effort name
  different selectors; with user-owned routing this is user-reachable (for example `deep.claude` and `implement.claude` at one effort).
  Not loosened here.
- The Antigravity native tier map (`AGY_NATIVE_TIERS`) is independent of the registry; a project's Antigravity selector does not change it.
- Readers listed OPEN above were not rewired. The three readers rewired in the third step (model-role-dispatch-select, critic-dispatch-preflight,
  critic-claude-host) have no new RED case of their own; their existing suites stay green. Suites run green: runner-profiles-v3,
  runner-profile-migration-v3 (63), dispatch-model-enforcement (15), dispatch-briefing (170), guard-dispatch (85), runtime-projection-v3,
  model-role-dispatch-select (11), critic-dispatch-preflight (108), critic-claude-host (1), agy-session-dispatch (10),
  goldfish-antigravity-host (15), post-compact-reground (30), kernel closure. Not run: codex-critic-packet-host, main-session-route,
  advisory suites. A dispatch-briefing case that exercises the project reader through `defaultClaudeRoute` was not written (the route
  seam is injectable; DME-C23 covers the guard reader).
- Test-first evidence file via the redacting writer was not produced (out of the write scope); the RED runs were observed in the transcript.
