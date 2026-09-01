---
schema: pipeline.backlog-item.v1
id: pipeline.the-push-authority-surface-cannot-be-bounded-by-static-enumeration
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Stashed draft, NVA-B-MKTATTEST (git stash list, stash@{0}: \"push-authority surface narrowing, enumeration proven INCOMPLETE (session-power.mjs missed via join()), do not trust without a sound dynamic-reference detector\"). Verified live 2026-09-01 against plugins/pipeline-core/scripts/session-cleanup.mjs and plugins/pipeline-core/lib/session-cleanup-recovery.mjs."
---

# The push-authority surface's dynamic-reference detector misses a `join()`-built subprocess path, so a narrower attestation would be incomplete by construction

## What is stashed, not committed

`git stash list` shows `stash@{0}`, titled by its own message: "NVA-B-MKTATTEST
design draft: push-authority surface narrowing, enumeration proven INCOMPLETE
(session-power.mjs missed via `join()`), do not trust without a sound
dynamic-reference detector". The stash diff adds
`resolvePushAuthoritySurface()` to `plugins/pipeline-core/lib/human-guard-override.mjs`
— a function meant to narrow the marketplace-attestation comparison
(`checkMarketplaceAttestation()` / `localPluginInstallSourceObservation()`)
from the whole `plugins/pipeline-core` tree down to the transitive closure of
files that can actually affect what `guard-git.mjs`/`guard-push.mjs` decide for
an ordinary `git push`. Confirmed live 2026-09-01: none of this code
(`resolvePushAuthoritySurface`, `pushAuthoritySpecifiers`,
`PUSH_AUTHORITY_ENTRY_POINTS`) exists in the current `human-guard-override.mjs`
on disk — the design is stashed only, not applied.

## The gap the stash's own message names

The closure walker's dynamic-reference detector (`pushAuthoritySpecifiers()`
in the stashed diff) recognizes exactly one shape for a subprocess script
reference: `new URL("<relative>.mjs", import.meta.url)`, matched by a
line-scoped regex. It has no rule for a `join(...)`-built path.

## Confirmed live against current source

Two real, currently-live files in the actual push-authority call graph build
their subprocess script paths with `join()`, not `new URL(...)`:

- `plugins/pipeline-core/lib/session-cleanup-recovery.mjs` line 49:
  `const DEFAULT_SCRIPT = join(HERE, "..", "scripts", "session-cleanup.mjs");`
  — this module is imported directly by `guard-push.mjs` (line 183:
  `import { planOrphanScratchRetirement } from "../lib/session-cleanup-recovery.mjs";`),
  so it is inside the closure the two named entry points (`guard-git.mjs`,
  `guard-push.mjs`) would seed.
- `plugins/pipeline-core/scripts/session-cleanup.mjs` line 81:
  `const SESSION_POWER_SCRIPT = join(HERE, "session-power.mjs");` — the exact
  file the stash's own commit message names (`session-power.mjs missed via
  join()`), reached one hop further through the first `join()`-built
  reference above.

Both are real `spawnSync(process.execPath, [<script>, ...])` targets (the
class of reference the closure walker's header comment itself says belongs in
the surface — "A spawned subprocess script's bytes can equally change what the
spawning hook's own decision relies on"). Neither would be discovered by the
stashed detector, because the detector's dynamic-reference regex only matches
`new URL(...)` and both of these are plain `join()` calls resolved through a
`HERE` constant, never passed through `new URL(...)` at all.

## Why this matters more than an ordinary missed case

The stashed design's whole premise (per its own header comment) is that a
computed, non-hand-curated boundary "cannot go stale the way a hand-maintained
list would". A detector that silently under-collects breaks exactly that
premise while looking like it still holds it: the surface is still "computed",
but computed from an incomplete recognizer, so a file that changes what
`guard-push.mjs` actually does — via a `join()`-built subprocess path — would
change behaviour without changing the narrowed attestation hash
(`pluginTreeSha256` in the stashed schema `v3`). That is a strictly worse
failure mode than the whole-tree hash the design set out to replace, which at
least errs toward over-inclusion.

## What this item is not

This is not a defect in the current shipped code — none of this narrowing
logic is applied; the existing whole-tree `pluginSourceTreeSha256()` /
`externalPluginSourceTreeSha256()` attestation is unchanged and out of scope
here. This item is a record against the stashed design landing as-is: any
future dispatch that pops or reimplements `stash@{0}` needs a sound
dynamic-reference detector (covering at minimum `join()`-built subprocess
paths, not only `new URL(...)`) before the narrowed attestation can be trusted
to be complete.
