---
schema: pipeline.backlog-item.v1
id: pipeline.runtime-projection-v2-eager-manifest-load
type: defect
owner: pipeline
status: open
created: 2026-07-27
source: "discovered as a sibling of Critic finding F4 (CLAUDE-RUNNER-01 delta review round 2) during briefing-i's fix of `plugins/pipeline-core/lib/runtime-projection-v3.mjs` (commit `894261d`)"
---

# `runtime-projection-v2.mjs` has the same eager module-scope manifest-load fail-open pattern F4 fixed in v3

## Description

`plugins/pipeline-core/lib/runtime-projection-v2.mjs:72-73` reads, parses,
and freezes `config/runtime-projection-v2-owned-keys.json` at module scope:

```js
const FROZEN_OWNED_KEYS = frozen(JSON.parse(readFileSync(OWNED_KEYS_PATH, "utf8")));
const FROZEN_OWNED_KEYS_CANONICAL_JSON = JSON.stringify(stableValue(FROZEN_OWNED_KEYS));
```

This is the identical pattern that was Critic finding F4 (CLAUDE-RUNNER-01):
a missing, unreadable, or malformed manifest throws during ES-module
evaluation, before any function in any importer can run. `runtime-projection-v3.mjs`
imports `runtime-projection-v2.mjs`, so the same import-time crash → node
exit 1 → "allow + config warning" (per `hooks/hooks.json`'s exit-semantics
comment) → fail-open path exists here too, via a different config file
(`runtime-projection-v2-owned-keys.json` instead of the v3 one), for every
consumer of `runtime-projection-v3.mjs` (including the fail-closed admission
hooks `guard-lifecycle-ready.mjs` and `codex-pretool-guard.mjs`).

## Triggering situation

Found while independently verifying briefing-i's fix
(`specs/2026-07-26-claude-runner-onboarding/briefing-i-runtime-projection-lazy-load.md`,
landed `894261d`) for CLAUDE-RUNNER-01's delta Critic review round 2. The
briefing scoped the fix to `runtime-projection-v3.mjs` only; the implementer
flagged this sibling pattern in `runtime-projection-v2.mjs` as out of scope
and recommended a follow-up item rather than silently expanding scope.

## Affected artifact

`plugins/pipeline-core/lib/runtime-projection-v2.mjs` (production code);
`plugins/pipeline-core/lib/runtime-projection-v2.test.mjs` (would need
load-safety coverage analogous to the new tests added for v3 in `894261d`).

## Proposal

Apply the same fix pattern used in `894261d`: replace the module-scope
`FROZEN_OWNED_KEYS` / `FROZEN_OWNED_KEYS_CANONICAL_JSON` constants with a
lazy, memoized accessor, called only from within existing function bodies
(none of the current reference sites appear to be at further module scope,
matching the v3 case, but this must be confirmed independently rather than
assumed). Add a subprocess load-safety test proving a missing/malformed
`config/runtime-projection-v2-owned-keys.json` does not crash on import and
surfaces only inside whichever function needs it. Run the full regression
sweep across every consumer of `runtime-projection-v2.mjs`
(`runtime-projection-v3.mjs` and its own consumers, at minimum) since this
is a foundational, widely-shared library file — same rigor as `894261d`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
