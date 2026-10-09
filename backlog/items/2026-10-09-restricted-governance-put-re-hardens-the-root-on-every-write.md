---
schema: pipeline.backlog-item.v1
id: pipeline.restricted-governance-put-re-hardens-the-root-on-every-write
type: improvement
owner: pipeline
status: open
created: 2026-10-09
source: "WIN-GES-D3 diagnosis (specs/sprint-alfred-epic/evidence/win-ges-d3-reharden-2026-10-09.md); Ruling 148"
sprint: alfred
done_when: manual
due: 2026-11-30
---

# Restricted governance put re-hardens the root on every write

## Description

`putRestrictedGovernanceEvent` (`plugins/pipeline-core/lib/governance-event-store.mjs:1716`) always calls
`assertRestrictedRoot` with `create: true`, and `assertRestrictedRoot` (`:231`) hardens the root whenever `create` is
true, even when the root already exists and is secure. Its own docblock (`:207-217`) describes `create` as "create
when absent". On win32 each harden spawns PowerShell, so every restricted put costs two extra process spawns.

Until WIN-HARDEN-F (Ruling 148) this also made every put after the first fail, because the hardener was not
idempotent. After that fix the behaviour is correct but wasteful.

## Decision needed (why this is not in the 0.7.0 candidate)

The diagnosis proposed using `mkdir`'s return value (the first path created, or `undefined`) as "created", and
hardening only then. That changes behaviour for a root that already exists but is NOT hardened: today it is fixed on
the next put; afterwards it would be refused (assess only). Whether a put should repair or refuse such a root is the
same question as the D0 posture for the agent-pipeline segment (Ruling 141), so it should follow that answer rather
than be decided separately.

## Acceptance

- A test-first slice pins: `create: true` on an existing, secure root assesses and does not harden (platform-independent
  through the io seam, next to the existing `:1242`/`:1258` cases).
- The behaviour for an existing, insecure root follows the D0 posture, with its own pin.
- Native win32 timing of a restricted put before and after is recorded.
