---
schema: pipeline.backlog-item.v1
id: pipeline.runtime-projections-drift-after-v3-refresh
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: manual
tracking: "Nova B — a silent divergence between two files that are meant to project the same authority; a consumer cannot judge it, and neither can this report"
source: "Consumer project HA, incident report S56 side finding (2026-08-28). Observed, not diagnosed: neither the consumer nor this item has established which value is correct."
---

# The two runtime projections diverged after a V3 refresh

## What was observed

After this session's V3 refresh, the two runtime projections no longer agree:

| file | sha256 |
| --- | --- |
| `.claude/pipeline.yaml` | `cda3e039073827c2f90f710aa0c2dc823678e8331826f59f7477485ae8fa11b3` |
| `project/pipeline.yaml` | `9ca8ccdbd2dfb5398f4b8a877d98d89e3b7b82c18c833ad88d2a507c6032fc09` |

The migrator (`runner-profile-migration-v3.mjs`) updated only the first. The PO gate reads
the second.

## Why it matters even without a diagnosis

Two files that project the same authority, updated by different writers, read by different
consumers, with no check that they agree. Whether this particular divergence is intended
(the two tiers legitimately carry different content) or a real drift, the shape is the
problem: nothing detects disagreement, so a consumer sees only its downstream effects.

The consumer's own note is worth keeping verbatim in spirit: they could not judge whether
this is intended, and that is itself the finding.

## Not established

- Whether the two files are supposed to be byte-identical, or to differ by construction.
- Whether the PO gate reading `project/pipeline.yaml` while the migrator writes
  `.claude/pipeline.yaml` is the intended split or an oversight.
- Whether this contributed to the postimage-readback refusal filed separately (that item's
  own diagnosis names `project/pipeline.yaml` as matching its expected digest, so probably
  not — but it is the same pair of files, and worth checking together).

Establish these before changing anything: a "fix" that syncs two files which are meant to
differ would be worse than the drift.

## Acceptance criteria

- The intended relationship between the two projections is stated somewhere durable.
- If they must agree, a check detects when they do not, at the point one is written.
- If they may differ, the reason is recorded where a consumer looking at both can find it.

## Related

- `2026-08-28-a-fail-closed-rollback-names-no-predicate-so-a-consumer-cannot-fix-it.md` —
  same file pair, same session; check them together.

## Progress note (2026-08-29, backlog sweep)

Commit cf14f274 added manifestDriftDiagnostics() to project-authority.mjs,
detecting divergence between the neutral/legacy manifest pair the same way
calibrationDriftDiagnostics() already does for the calibration pair. The
item's other acceptance criterion -- a durable, stated intended relationship
between the two files -- is still open.
