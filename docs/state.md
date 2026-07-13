# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-07-13
**Project status:** ACTIVE
**Current block:** public handover and internal-link repair — OPEN
**Repair baseline:** `6ff4e5fbfbd5784b612e791573d7081b152d8dc6`
**Release version:** `0.2.0`

## Operational head

- Project calibration: [`.claude/pipeline.json`](../.claude/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- This file is the sole current/open/next handover under
  [ADR-0012](adr/0012-handover-canonicalization.md) and
  [ADR-0015](adr/0015-self-application.md).
- No reusable full-bootstrap receipt is stored publicly. Run the full bootstrap.
- Git availability and version are probed locally; machine-specific installation
  details are never versioned here.

## Open items and next block

- The bounded documentation repair remains open until the exact Shared commit
  passes the full verify gate plus link, privacy and independent authority review.
- Runtime, guard and policy semantics are outside this block.
- No DELIVERED or ACCEPTED claim is made for this open block.
- Next: finish the bounded repair, update this head with its exact evidence, then
  continue the separately gated front-door and documentation-maintenance work.
- This file authorizes no remote write, release, tag or history rewrite.

## Re-entry

1. Maintainers start with [`CLAUDE.md`](../CLAUDE.md).
2. Run the full [`pipeline-start` bootstrap](../harness/session-bootstrap.md).
3. Confirm the configured verify command is available.
4. Continue only the bounded next block above; otherwise return to a plan gate.

## Recovery

No persisted in-flight dispatch, rollback action or public human-gate acceptance
is recorded. If the checkout shows conflicting work, stop and report it before
writing.
