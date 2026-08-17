---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-guard-allowlist-still-misses-apply-partial-authority-and-adopt-remote
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 2d28722138a8a378f9ec93a60247caea5536adbf
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-17-lifecycle-guard-partial-authority-adopt-remote-closure.md
source: "Reported by the PO on 2026-08-17, relaying a live-blocking audit from a downstream consumer-project session (Windows, D:\\Dev\\Web\\Toolbox) doing onboarding recovery against a vendored copy of this plugin. Independently confirmed against this repository's own source before filing."
---

# `guard-lifecycle-ready.mjs`'s `sanctionedOnboardingArgs()` still misses three real, CLI-constructed command shapes

## Description

`sanctionedOnboardingArgs()` (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1333`)
allowlists the exact argv shapes an agent may pass to
`project-onboarding-v3.mjs`. `plan-partial-authority` was already added to
this function (GUARDALLOW-1, backlog
`2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md`)
but three real, currently-constructed shapes in the same command family are
still missing — confirmed by direct source reading, not just the relayed
report:

1. **`plan-partial-authority --root <root> [--runner <r>] --profile <p> --source <s>`.**
   `scripts/project-onboarding-v3.mjs:54` documents this shape in its own
   usage text (`--profile <epic|feature|mini> --source <selection>` as an
   optional pair), and its parser (`scripts/project-onboarding-v3.mjs:135`)
   passes `options.profile`/`options.source` through to
   `planProjectPartialAuthorityAdoption()`. `lib/project-onboarding-v3.mjs:443`
   explicitly instructs a human/agent to "re-run plan-partial-authority with
   `--profile` and `--source` `canonical-fresh-v3` after PO selection" — the
   guard currently only admits the BARE `--root [--intent <value>]` shape
   (`guard-lifecycle-ready.mjs:1357-1361`), so this diagnostic's own suggested
   retry is refused.
2. **`apply-partial-authority --root <root> --profile <p> --source <s> --plan-sha256 <sha> --activate`.**
   `lib/project-onboarding-v3.mjs:470` constructs exactly this command as the
   plan's own `applyAction`. `sanctionedOnboardingArgs()` has no
   `apply-partial-authority` branch at all — this is the very next step after
   a successful `plan-partial-authority` and is currently 100% unreachable.
3. **`adopt-remote plan --root <root> --remote <r> --ref <ref>` and
   `adopt-remote apply --root <root> --remote <r> --ref <ref> --plan-sha256 <sha> --activate`.**
   `lib/project-onboarding-v3.mjs:4198` and `:4111` construct exactly these
   two commands. This is the documented `onboarding-recovery.md` path for
   `portable-seed-required` when an existing remote+branch is supplied.
   `sanctionedOnboardingArgs()` has no `adopt-remote` handling at all — this
   entire recovery path is currently 100% unreachable for any not-ready
   project.

Separately noted (informational, no fix needed): `kickoff promote plan`/
`kickoff promote apply` is also absent from this allowlist, but per the
reporting session's own check, the allowlist is bypassed entirely once a
project reaches `ready` status, so this specific absence is provably
unreachable — do not add it, or it will read as a plausible fourth bug later.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, function
`sanctionedOnboardingArgs()` (currently lines 1333-1401).

## Proposal

Add three new `if` branches immediately after the existing
`plan-partial-authority` branch (lines 1357-1363), mirroring its own
established style (`exactRoot`, closed `--intent` enum, no reordering
tolerance):

1. Extend (or add a sibling branch for) `plan-partial-authority` to also
   admit `--profile <epic|feature|mini> --source <value>` after `--root`,
   with the same optional `--intent <value>` tail already supported.
2. A new `apply-partial-authority` branch admitting exactly
   `--root <root> --profile <p> --source <s> --plan-sha256 <hex> --activate`
   (mirroring the existing `apply-manifest-repair` branch's shape at line
   1364).
3. A new `adopt-remote` branch admitting both
   `adopt-remote plan --root <root> --remote <value> --ref <value>` and
   `adopt-remote apply --root <root> --remote <value> --ref <value> --plan-sha256 <hex> --activate`.

**Caveat carried from the reporting session, unverified:** the proposed
`--ref` check is deliberately loose (non-empty, not a flag-shaped string) —
whether it should instead enforce a stricter `refs/heads/`-prefixed shape is
an open design question for whoever implements this, not resolved here.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted for gaps 2 and 3 only. **Gap 1
  (`plan-partial-authority --profile/--source`) is REJECTED as
  mischaracterized** — corrected on direct source verification before
  dispatch, 2026-08-17. `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:1432-1444`
  already carries a deliberate, documented negative assertion for exactly
  this shape, with its own comment: "`--profile`/`--source` are valid
  CLI-level flags for this command (usage text), but the guard admits only
  the exact `nextAction` shape the inspection actually emits — never the
  wider human-invoked shape — so these still fall through to refusal."
  Cross-checked against every `plan-partial-authority` construction site in
  `lib/project-onboarding-v3.mjs` (lines 3436, 3717): both emit only the bare
  `--root <root> [--intent <value>]` shape via `lifecycleArgv`; the
  `--profile`/`--source` pair appears ONLY inside a free-text diagnostic hint
  string (line 443, `"re-run plan-partial-authority with --profile and
  --source canonical-fresh-v3 after PO selection"`), never as a machine-built
  `commandAction`/`nextAction` argv. Unlike gaps 2 and 3 (each backed by an
  exact `commandAction(...)` construction site that becomes 100% unreachable
  if refused), gap 1 describes a shape a human/agent could construct by
  reading the CLI's own `--help` usage text — a materially different,
  already-deliberately-closed admission class. Widening the allowlist here
  would require deleting or reversing an existing, intentional test, not
  filling a gap.
  Gaps 2 (`apply-partial-authority`) and 3 (`adopt-remote plan`/`adopt-remote
  apply`) remain independently confirmed against exact construction sites
  (`lib/project-onboarding-v3.mjs:470`, `:4111`, `:4198`) with no
  countervailing test — genuine, currently-unreachable gaps. Same defect
  class and same file as the already-fixed `plan-partial-authority` bare-root
  gap (GUARDALLOW-1) — a guardrail/hook file, so this goes through a
  `goldfish-deep` dispatch with mandatory Critic review, not a same-session
  edit.
- **Rationale:** `guard-lifecycle-ready.mjs` is a hook/guardrail file
  (MP-07); the pattern (a real CLI-constructed command the allowlist
  refuses) is identical to the already-fixed sibling gap for gaps 2/3, each
  with a directly analogous existing branch to mirror. Gap 1 does not fit
  that pattern once the existing negative test is read, and briefing a
  goldfish to "fix" it would have meant briefing it to delete a deliberate
  safeguard — caught before dispatch rather than after a Critic FAIL.
- **Assignment (if accepted):** next available dispatch slot in this AFK
  block, scoped to gaps 2 and 3 only.
- **Date:** 2026-08-17

## Closure (2026-08-17)

Closed after two Critic rounds (round 1 FAIL: evidence gap + precision;
round 2 FAIL: F-A gate-state red-Verify violation + F-B minor `--ref`
residual) and one round of Elephant self-verification per the two-round
Critic cap. See
`specs/sprint-nova-epic/evidence/backlog/2026-08-17-lifecycle-guard-partial-authority-adopt-remote-closure.md`
for the full timeline, including the unrelated `backlog-state-check` root
cause found and fixed while chasing F-A, and the F-B `--ref` fix
(`2d287221`). Both accepted gaps (2, 3) are fixed and independently
re-verified; the reviewed code itself was never faulted by either Critic
round.
