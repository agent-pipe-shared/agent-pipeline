---
schema: pipeline.backlog-item.v1
id: pipeline.verify-test-economy-rebuild
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-20
source: "PO decision D69 (2026-10-20) and ADR-0088, after the Full Verify measurement of c1771bc98 (138 red steps, about 13 000 cases, 5 h)."
sprint: none
done_when: manual
---

# Rebuild Verify around a fast gate, a fresh full run and a runtime budget

## Description

ADR-0088 fixes the test-economy rules; this item builds what the 0.7.0 candidate leaves out.
It bundles `2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md`,
`2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md` and
`2026-10-17-full-verify-on-windows-takes-hours.md`.

## Acceptance

- Verify has a fast tier (under 10 minutes on WSL) used at commit and push boundaries and a full
  tier (under 60 minutes on WSL) used nightly and before a candidate; each suite has a runtime
  budget and an overrun is reported as a finding.
- A candidate is refused without a full run within the freshness bound (ADR-0088 rule 2).
- Quarantined cases are counted and reported separately, each with owner and expiry; an expired
  quarantine is a red result; the red-or-quarantined count may not grow between full runs.
- The `lib/pins/*` suites are merged into their owner suites where they pin the same contract, and
  superseded cases are removed, each with its reason and a Critic review.
- The calibration accepts optional `verify.quick` and `verify.full`; a project without them keeps
  one command for every boundary.
