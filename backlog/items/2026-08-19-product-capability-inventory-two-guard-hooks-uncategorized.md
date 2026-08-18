---
schema: pipeline.backlog-item.v1
id: pipeline.product-capability-inventory-two-guard-hooks-uncategorized
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Found by PHX-WP-BACKLOG-OBSGOV-MISC-TRIAGE while diagnosing product-capability-inventory-tests failure from a full clean-candidate Verify run, 2026-08-18/19."
---

# Two new guard hooks have no product-capability-inventory home, and are unwired from hooks.json

## Description

`check-product-capability-inventory.mjs`'s `discoverSurfaces()` finds 12
undeclared surfaces: 10 are mechanical (new `verify.mjs` TEST_SUITES entries)
that clearly belong in the existing single `deterministic-verification`
capability, matching all 377 other verify-phase surfaces). The other 2 are a
real, unresolved gap: `guard-el01-tripwire.mjs` and
`guard-onboarding-consent-lock.mjs` (two new guard hooks landed this session,
commits `27b4867d`/`286673e2`) are not wired into `hooks.json` or
`codex-hooks.json` anywhere (confirmed zero references outside their own
file+test), and existing guard hooks are split between the
`claude-hook-safety` and `codex-host-hook-bridge` capabilities by which
runner(s) they're scoped to — a distinction that cannot be determined for
these two hooks until their `hooks.json` wiring (currently blocked by TP-4,
per their own commit messages) actually lands.

## Affected artifact

`governance/product-capability-inventory.json` (or wherever the capability
declarations live — check `check-product-capability-inventory.mjs` for the
exact source of truth), `plugins/pipeline-core/hooks/guard-el01-tripwire.mjs`,
`plugins/pipeline-core/hooks/guard-onboarding-consent-lock.mjs`,
`harness/scripts/verify.mjs` (the 10 mechanical new TEST_SUITES entries).

## Proposal

Two separable pieces: (1) mechanical — add the 10 new verify-phase surfaces to
the existing `deterministic-verification` capability declaration, no judgment
call needed. (2) blocked on a prerequisite — the 2 guard hooks' capability
classification (`claude-hook-safety` vs. `codex-host-hook-bridge` vs.
something new) genuinely cannot be determined until their `hooks.json`
wiring is completed via the pending TP-4-scoped HGO ceremony these hooks are
already waiting on; classify them once that wiring lands, not before.

## Triage — 2026-08-19

- **Decision:** accept-open; piece (1) is dispatch-ready now, piece (2) is
  blocked on the same TP-4/HGO ceremony `guard-el01-tripwire.mjs` and
  `guard-onboarding-consent-lock.mjs` already need for their own `hooks.json`
  registration.
- **Rationale:** Piece (1) is purely mechanical and safe to do independently.
  Piece (2) has a genuine, already-known external blocker (PO's Ed25519 key,
  outside this session), not a design ambiguity to resolve in-session.
- **Assignment (if accepted):** Piece (1): Goldfish, immediately. Piece (2):
  after the TP-4/HGO ceremony for the two guard hooks completes.
- **Date:** 2026-08-19
