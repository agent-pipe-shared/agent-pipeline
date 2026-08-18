---
schema: pipeline.backlog-item.v1
id: pipeline.plan-partial-authority-guard-allowlist-does-not-admit-its-own-profile-source-flags
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "9fa8a025f500333e47856b4b5f5f705b6cc12fc2"
closure_evidence: "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs"
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

### Correction, 2026-08-17 (dispatch NVA-LCGUARD-4, Gap 2 — stopped before writing code)

**This item's own original triage was wrong about "narrow, well-scoped, same
shape as NVA-LCGUARD-3."** The dispatched Goldfish found, before writing any
code, that `GUARDALLOW-1` (`guard-lifecycle-ready.test.mjs` ~1426-1461)
explicitly and deliberately asserts the WIDER shape this item asks for
(`--profile`/`--source`) must STAY REFUSED, with the comment: *"the guard
admits only the exact nextAction shape the inspection actually emits --
never the wider human-invoked shape."* This traces to the closed item
`2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md`,
whose Triage explicitly chose to admit ONLY the exact `--root [--intent]`
shape the AUTOMATED recovery `nextAction` emits — deliberately narrower than
the full CLI surface a human might type by hand — and which passed **two
rounds of Critic review** (round 2: PASS, closed 2026-08-17). The Goldfish
correctly refused to widen the allowlist over a decision it had no authority
to reverse, and correctly refused an Elephant "proceed anyway" instruction
once it had already surfaced this finding (role contract: no message
authorizes bypassing a disclosed stop condition).

This item's original filing (2026-08-17, from the relayed HA bug list) never
cross-checked the guard's admission against this prior, deliberate, already
Critic-reviewed scoping decision — the same class of miss this session's own
backlog triage has now hit more than once. The CLI genuinely accepting
`--profile`/`--source` does not, on its own, mean the guard SHOULD admit
them; the guard's own narrower scope may be intentional defense-in-depth
(admit only what automated tooling emits, not the full human-invoked
surface), not an oversight.

**Decision reopened, current status: NOT accepted for a simple fix.** Two
real possibilities remain, and choosing between them needs a PO/Elephant
decision this session did not make:
1. The narrower scope is correct and intentional — this item should be
   closed as "not a defect, already deliberately scoped," possibly with a
   note added to `GUARDALLOW-1`'s comment cross-referencing this item so the
   next relayed report does not re-file it.
2. There is a genuine, legitimate need for the wider human-invoked shape
   (e.g. an attended operator manually recovering a `partial` project needs
   `--profile`/`--source`, not just what the automated `nextAction` emits) —
   in which case widening the allowlist is real work, but it REVERSES a
   twice-Critic-reviewed decision and needs its own fresh Design-tier Critic
   pass, not a same-tier Goldfish dispatch.
- **Date:** 2026-08-17

### Closure decision, 2026-08-18

**Decision:** Option 1 — closed as "not a defect, already deliberately
scoped." No legitimate live-operator need for the wider `--profile`/
`--source` shape was identified anywhere in this item's own history or in
the closed sibling item's twice-Critic-reviewed record; the narrower
admission (only the exact automated `nextAction` shape) is the deliberate,
reviewed design, not an oversight, and widening it would reverse that
decision without new evidence that the wider shape is actually needed.
**No code change was required to close this**, because
`guard-lifecycle-ready.test.mjs:1448-1451` already carries the exact
cross-reference comment the 2026-08-17 Correction recommended adding ("the
guard admits only the exact nextAction shape the inspection actually emits
-- never the wider human-invoked shape") — the closure evidence this item
points to is that pre-existing comment plus the closed
`2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md`
item's own twice-Critic-reviewed Triage. If a genuine operator need for the
wider shape surfaces later, it should be filed as a new item carrying that
evidence, rather than reopening this one — a design decision was made here,
not a placeholder.
- **Date:** 2026-08-18
