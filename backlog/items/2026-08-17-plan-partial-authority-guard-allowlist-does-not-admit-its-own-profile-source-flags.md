---
schema: pipeline.backlog-item.v1
id: pipeline.plan-partial-authority-guard-allowlist-does-not-admit-its-own-profile-source-flags
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Live consumer-project happy-path test, D:\\Dev\\HA, 2026-08-17, runner Claude, version 0.5.5+claude.20260817142605.6465407 -- relayed and independently re-verified against this checkout's own current source before filing. One of three examples from that report; the other two were checked and found already fixed/admitted (see Triage)."
---

# `guard-lifecycle-ready.mjs` admits `plan-partial-authority --root [--intent]` but not the CLI's own documented `--profile`/`--source` extension

## Description

`scripts/project-onboarding-v3.mjs` genuinely accepts optional
`--profile`/`--source` flags on its `plan-partial-authority` subcommand
(confirmed at lines 54, 94-95, 162). `hooks/guard-lifecycle-ready.mjs`'s
allowlist for this subcommand (~lines 1380-1384) only admits the bare
`--root [--intent ...]` form — no branch recognizes the `--profile`/
`--source` extension, so a legitimate, CLI-documented invocation is refused
as "not in the allowlist," forcing the PO to run it by hand in a separate
terminal.

This is the same recurring pattern already fixed once today, for a
different subcommand pair, as `NVA-LCGUARD-3` (`plan-repair`/`apply-repair`
operator-authority argv shape, commit `13ed8293`): the guard's admitted argv
shapes lag the CLI's own real shape and are not derived from one shared
source of truth.

## Two other examples from the same report, checked and NOT filed as new gaps

- `apply-repair --id --plan-path --prd-path --spec-path --language`: already
  fixed today by `NVA-LCGUARD-3` (commit `13ed8293`) — the relaying session's
  version predates that fix or its resync.
- `po-gate-profile-repair.mjs apply --human-facing de --plan-sha256 ...
  --activate`: already admitted — `sanctionedPoProfileRepairArgs()` (~lines
  1681-1695) explicitly recognizes this exact 8-argument shape. Not
  reproduced against current source; the denied command in that report may
  have differed in flag order/placement, not verifiable from prose alone.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`,
`sanctionedOnboardingArgs()`/the `plan-partial-authority` branch (~lines
1380-1384).

## Proposal

Not designed here — narrow, mechanical fix mirroring `NVA-LCGUARD-3`'s own
shape: add a branch admitting `plan-partial-authority --root <path>
[--intent <value>] [--profile <value>] [--source <value>]`. The broader,
already-noted structural question (deriving the guard's admitted set from
the onboarding CLI's own table instead of hand-maintaining parallel
allowlists) is tracked separately:
`2026-08-16-guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table.md`
— this item is one more concrete instance of exactly the problem that item
already describes in general, not a competing proposal.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — narrow, well-scoped, same shape as
  today's already-completed `NVA-LCGUARD-3` fix.
- **Rationale:** independently re-verified against this checkout's own
  current source; the CLI genuinely accepts the flags, the guard genuinely
  does not admit them.
- **Assignment (if accepted):** goldfish-deep, guardrail-tier (MP-07), plus
  Critic review before considered done. Cheap to bundle with the sibling
  structural item above if that is picked up around the same time.
- **Date:** 2026-08-17
