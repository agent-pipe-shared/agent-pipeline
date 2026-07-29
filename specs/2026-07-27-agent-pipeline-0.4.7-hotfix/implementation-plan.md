# Implementation plan — Issue #73 neutral authority correction

Status: correction delta after independent Critic review.

Authority remains the approved PRD and technical Spec in this directory. This
plan records the deliberate production-surface deviation required to finish
their runner-neutral PO-authority, portable-State, and follow-up installation
requirements.

## Named scope and architecture deviation

Spec section 2.1 predates the runner-neutral authority cutover and does not
enumerate these now-required surfaces:

- `plugins/pipeline-core/lib/project-authority.mjs`;
- `plugins/pipeline-core/scripts/project-authority-migration.mjs`;
- `plugins/pipeline-core/scripts/po-gate-profile-repair.mjs`;
- the direct manifest, State, calibration, guard, Security, onboarding, and
  freshness consumers migrated to the coherent authority resolver; and
- `project/pipeline.yaml`, `project/pipeline.json`,
  `project/guard-config.json`, and the portable
  `project/pipeline-state.json`.

This is a deliberate deviation from the exhaustive expected-surface list and
from architecture-guideline items 6, 7, and 10. A separate public-API version
is not introduced because the change is an additive compatibility layer:
neutral authority is selected as one coherent set, legacy authority remains a
read-only fallback, and mixed layers fail closed. The resolver is kept in one
module so callers cannot independently choose manifest, State, calibration,
or guard authority. Tests remain next to their existing source-family
conventions.

The deviation is necessary to satisfy AC-047-30–34 and AC-047-48–50 without
making `.claude` a permanent runner-specific PO-authority namespace. It also
closes AC-047-39 at the migration boundary: a non-null
`continuity.runtime.sessionCleanup` blocks portable State creation before any
transaction byte is written.

## Threat and compatibility assessment

The updated threat boundaries are recorded in
`docs/codex-onboarding-threat-model.md` and
`docs/sentinel-scope-extension-threat-model.md`.

- Neutral and legacy files are never combined into one authority decision.
- Workflow writers protect both State aliases and still require the sanctioned
  Coordinator writer.
- Security evidence hashes the resolved manifest and policy inputs; absent,
  mixed, or invalid authority cannot produce an exact-policy claim.
- Human approval text is compared as ordinary JSON string data. Persisted
  canonical hashing remains unchanged.
- Legacy consumers remain supported during the dual-read/one-write rollout.

No dependency, credential, personal-data flow, or live deployment is added.
There is no deferred security risk in this correction.

## Rollback and rollout

Rollback is a normal revert of the correction commits before installation.
An interrupted authority copy uses its digest-bound recovery plan and restores
recorded preimages. Consumer repositories are never mutated by packaging or
installation.

Rollout order:

1. focused regressions and exact-candidate Full Verify/Security;
2. independent high-risk Critic;
3. cachebuster update, commit, repeat exact-candidate gates, then reinstall the
   local plugin and verify installed/source byte identity;
4. fresh Codex process so the new plugin identity is loaded;
5. for Nova and Phoenix separately, inspect the new digest-bound PO decision,
   obtain the exact Human selection/apply confirmation, apply once, verify all
   three V4 intents, then run repository freshness.

Remote freshness is never inferred before the consuming repository reaches V4
readiness. No PO decision digest or confirmation is reused across repositories
or plugin versions.
