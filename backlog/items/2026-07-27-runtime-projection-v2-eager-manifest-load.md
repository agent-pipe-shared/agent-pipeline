---
schema: pipeline.backlog-item.v1
id: pipeline.runtime-projection-v2-eager-manifest-load
type: defect
owner: pipeline
status: closed
created: 2026-07-27
closed_at: 2026-08-17
closure_repository: self
closure_commit: 456b7beb2cb16a567fd4602525d1c6b17c9b0f89
closure_evidence: plugins/pipeline-core/lib/runtime-projection-v2.test.mjs
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

- **Decision:** accepted, confirmed still live — remains current-scope, not
  deferred.
- **Rationale:** re-verified against current source,
  `plugins/pipeline-core/lib/runtime-projection-v2.mjs:72-73` — the eager
  module-scope `FROZEN_OWNED_KEYS`/`FROZEN_OWNED_KEYS_CANONICAL_JSON` load
  is unchanged; the same fail-open pattern F4 fixed in v3 (`894261d`) is
  still present here, and `runtime-projection-v3.mjs` still imports this
  module. Security-relevant (fail-closed admission hooks depend on this
  import chain), not a candidate for deferral.
- **Assignment (if accepted):** unassigned — apply the same lazy/memoized
  accessor fix pattern used in `894261d`, per this item's own Proposal.
- **Date:** 2026-08-17

### Closed 2026-08-17 (overnight AFK block, NVA-RTPROJ2-1)

Fixed exactly as proposed: `FROZEN_OWNED_KEYS`/`FROZEN_OWNED_KEYS_CANONICAL_JSON`
replaced with a lazy, memoized `frozenOwnedKeys()` accessor mirroring v3's
own shape, doc comment, and not-memoized-on-failure property. All four use
sites updated (comparison, default parameter, `planFromValidatedIntent`
manifest arg, target iteration) — the default-parameter site confirmed
safe because JS evaluates default expressions at call time, validated
against v3's identical site. New subprocess-based load-safety test proves
import no longer touches disk. Full regression sweep green: 21/21, 23/23,
plus three more consumer suites (2/2, 15/15, 50/50). No exported symbol
renamed; confirmed no external consumers of the removed constants.
Independently re-verified: `node --test
plugins/pipeline-core/lib/runtime-projection-v2.test.mjs
plugins/pipeline-core/lib/runtime-projection-v3.test.mjs` both green.
