---
schema: pipeline.backlog-item.v1
id: pipeline.two-more-critic-preimage-pins-surfaced-by-the-accumulate-fix
type: defect
owner: pipeline
status: closed
created: 2026-08-18
closed_at: 2026-08-18
closure_repository: self
closure_commit: d5e5fed754098037f7142d786a122128880c2459
closure_evidence: backlog/items/2026-08-12-four-critic-preimage-pins-drifted-or-never-valid.md
source: "Surfaced by NVA-MICRO-3's fix to codex-isolated-critic-protected-preimage.test.mjs's assertion loop (fail-fast -> accumulate-all-mismatches, closing 2026-08-10-preimage-repin-disclosure-incomplete-for-roles-critic), 2026-08-18. The accumulate fix's own designed effect exposed two more mismatches beyond the one it was written to find."
---

## Closure

Independently re-verified 2026-08-18 (NVA-W0-1): confirmed sibling item
`backlog/items/2026-08-12-four-critic-preimage-pins-drifted-or-never-valid.md`
exists, is still `status: open`, and already names exactly the same two
files (`codex-critic-dispatch.schema.json`, `codex-critic-host.mjs`) as its
own "never-valid" entries, with a Sprint Alfred assignment covering
investigating and re-pinning both. This item's own 2026-08-18 re-triage
already reached this same conclusion. Closed as a duplicate instance of
that item's scope, per `backlog/README.md`'s duplicate-merge convention —
no independent dispatch needed; tracking stays on the older, canonical
item.

# `codex-isolated-critic-protected-preimage.v1.json` has two more stale pins the fail-fast test loop was hiding

## Description

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs`'s
assertion loop was just changed (NVA-MICRO-3, commit `0bae45d3`) from
fail-fast (`assert.equal` per entry, throws on first mismatch) to
accumulate-all-mismatches (`assert.deepEqual` once, on the full list). That
fix was written to resolve one known stale pin (`roles/critic.md`, closed
separately) but its own designed effect immediately surfaced two more,
previously invisible behind the fail-fast throw:

```
plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json
  expected: ccca8d8111cdae40dd7b164649cf546229771cc1794b67863aeaeb7d9e4a0476
  actual:   1d447929e9f3f3c86dd8698e7bbcf7c9d8e428d3f7ddca20118a838bd4b76e3d

plugins/pipeline-core/scripts/codex-critic-host.mjs
  expected: 73a0204d4fd1d3898d43e08500c1ecc478d78b7866e5059196b504fcdc741c9f
  actual:   387563e93e08b6b503a4c751faa44c38cf6046ecfd7542ee10968083f85e4f26
```

A third, already-known stale pin (`harness/review-protocol.md`, recorded in
`docs/state.md` since 2026-08-10) also remains in the accumulated list — not
new, not re-filed here.

## Why it matters

Same class as the two already-closed siblings in this same inventory file:
an "protected preimage" baseline that silently drifted from two more of its
nine pinned files, undetected because nothing runs this suite in
`verify.mjs` and the old fail-fast loop hid all but the first mismatch even
from a human reading the test's own output.

## Affected artifact

`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`
(the `codex-critic-dispatch.schema.json` and `codex-critic-host.mjs`
entries).

## Proposal

Not measured here — NVA-MICRO-3 explicitly left this out of its own scope
(only `roles/critic.md` was named in the item it was closing). Whoever picks
this up must first determine, for each of the two files, whether the drift
is a deliberate/disclosed content change (re-pin, same as commit `7172a15b`
did for two other entries) or an undisclosed one worth tracing to its
origin commit before re-pinning. Neither fix is registered in `verify.mjs`
today, so this blocks nothing, same as its siblings.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, open, unassigned.
- **Rationale:** small, well-scoped, same pattern as two already-closed
  siblings in this exact file — re-pin after confirming deliberate vs.
  undisclosed drift for each of the two files, add nothing to `verify.mjs`
  (per the established scope boundary for this inventory).
- **Assignment (if accepted):** candidate for a goldfish-implementor
  dispatch — not yet dispatched.
- **Date:** 2026-08-18

### Re-triaged, 2026-08-18 (0.6.0 release sweep)

- **Decision:** deferred — duplicate covered by the Sprint Alfred item.

- **Decision:** accepted, open — not a new problem: both files this item
  names (`codex-critic-dispatch.schema.json`, `codex-critic-host.mjs`) are
  the exact same two "never-valid" entries
  `pipeline.four-critic-preimage-pins-drifted-or-never-valid`
  (`backlog/items/2026-08-12-four-critic-preimage-pins-drifted-or-never-valid.md`)
  already identified and scoped its own Sprint-Alfred-deferred investigation
  around (see that item's "Direction, not a design" step 1). The
  accumulate-fix (NVA-MICRO-3) gave a second, independent confirmation of a
  defect already inventoried there — it did not surface a new file.
- **Rationale:** avoids double-tracking the same two-file remediation in two
  places. `pipeline.four-critic-preimage-pins-drifted-or-never-valid`'s
  Sprint Alfred assignment ("dedicated goldfish-deep investigation plus
  Critic review, per the item's own Direction section") already covers
  investigating and re-pinning exactly these two files (deliberate vs.
  undisclosed drift, per this item's own "Proposal"). No independent
  dispatch needed for this item.
- **Assignment (if accepted):** none separate from
  `2026-08-12-four-critic-preimage-pins-drifted-or-never-valid.md`'s
  existing Sprint Alfred assignment — close this item as a duplicate
  instance once that item's investigation lands, rather than dispatching it
  on its own.
- **Date:** 2026-08-18 (re-triaged)
