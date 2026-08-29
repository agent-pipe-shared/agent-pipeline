---
schema: pipeline.backlog-item.v1
id: pipeline.verify-contract-fails-until-configured-but-gs-10-blocks-configuring-it
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 64069ea3121d2da1be68f5e3079191e6610debe4
closure_evidence: plugins/pipeline-core/scripts/pipeline-state.test.mjs
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- happy-path deadlock, confirmed independently by 2 of 3 runners against the 2026-08-29 candidate (built ab0906d, stamped 0bf246d1) which already contained the 2026-08-11 verify-contract fix (674b1c0c)."
source: "Agy 060-76 greenfield retrospective, section 4.2 point 1 (UNCONFIGURED_VERIFY conflict with GS-10); Codex 060-77 greenfield retrospective, section 'Verify war als defer fachlich verständlich, technisch aber nicht produktiv verwertbar'."
---

# Onboarding seeds a verify command that intentionally fails until configured, but GS-10 blocks the agent from configuring it

## What happens

`2026-08-08-seeded-verify-contract-is-always-green.md` (closed 2026-08-11, commit
`674b1c0c`) fixed a real problem -- a placeholder verify command that always passed --
by making the seeded command **fail until replaced** with a real one, naming what to
replace it with. That fix is correct in isolation and is already present in the
2026-08-29 candidate both greenfield sessions tested against.

What it did not account for: `project/pipeline.json`'s `verify` field is
gate-strength protected (GS-10, "Attempted to edit project authority
configuration"). An agent trying to replace the failing placeholder with the
project's real verify command is blocked outright. The only way through, in both
the Agy and Codex greenfield sessions, was a human-run `git commit --no-verify`.

This is the SAME structural shape as the trust-anchor bootstrap circularity
(`2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md`, reopened
2026-08-29): a 2026-08-11 fix closed one half of a problem (always-green ->
fails-until-configured) without providing the OTHER half (a sanctioned way to
configure it), leaving a deadlock that only a human bypass can escape.

## Direction

Candidates, not exclusive:
1. Make the phase transition from `design` to `implementation` write the real verify
   command as part of the same transaction that unlocks implementation writes --
   before GS-10 is armed, mirroring the trust-anchor item's own Direction 3 ("same
   transaction" fix pattern).
2. A narrow, purpose-built `collect-input`/driver action specifically for "set the
   real verify command", satisfiable without a general GS-10 override.
3. Model an explicit, time-bounded `defer` verify state (Codex's own suggestion) that
   permits implementation but blocks push/close, with a clear next action to leave it.

## Acceptance criteria

- A fresh onboarding through first implementation dispatch completes without any
  human `--no-verify` bypass or manual GS-10 override for the verify field.
- The always-green regression class this deadlock's own prerequisite fix closed
  stays closed (no test regression on `674b1c0c`'s coverage).

## Closed, 2026-08-29 (NVA-CF-VERIFYDEADLOCK)

Direction 1 implemented exactly: `set-phase --phase implementation`
(`pipeline-state.mjs`, commit `64069ea3`) now REQUIRES a real
`--verify-command <cmd>` (refuses the UNCONFIGURED_VERIFY placeholder and
blank values) and writes it into both `project/pipeline.json` and the
legacy `.claude/pipeline.json` twin in the SAME transaction that unlocks
implementation, before GS-10 would otherwise arm for that field -- the
identical "same transaction" pattern used for the sibling trust-anchor
deadlock. Both acceptance criteria proven by a live in-process repro test
(no `git`/guard invoked at all): a fresh project with the seeded placeholder
is refused (exit 2, names the sanctioned escape) until a real command is
supplied, at which point implementation begins and both calibration tiers
carry the real, executable command; the always-green regression class
`674b1c0c` closed stays closed (the written command is a genuine,
runnable check, not a vacuous pass). Independently re-verified by the
Elephant: `node plugins/pipeline-core/scripts/pipeline-state.test.mjs` ->
"all checks passed". **Critic review required** before this candidate ships
(A/G/S-class: gate-strength/phase-transition logic) -- folded into the
session's single final Critic 1+1 round, not a separate dispatch.

## Triage

- **Decision:** accepted, Nova A (happy-path deadlock, confirmed live by 2
  independent runners against the actual candidate build)
- **Rationale:** cross-runner convergent finding; blocks the very first
  implementation step of a fresh project.
- **Date:** 2026-08-29

## Related

- `2026-08-08-seeded-verify-contract-is-always-green.md` (closed) -- the
  prerequisite fix whose other half this item completes.
- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` (reopened
  2026-08-29) -- the same "fix closed one half, human bypass covers the
  other" shape, same greenfield test run.
