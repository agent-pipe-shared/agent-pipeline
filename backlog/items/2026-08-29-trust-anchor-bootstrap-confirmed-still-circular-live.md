---
schema: pipeline.backlog-item.v1
id: pipeline.trust-anchor-bootstrap-confirmed-still-circular-live
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- happy-path blocker, confirmed live by 2 of 3 independent runners against the exact candidate the PO tested with."
source: "Codex 060-77 and Claude/Windows 060-78 greenfield retrospectives (scratch/greenfield-reports/), plus direct PO confirmation 2026-08-29: 'das ist auch mein Eindruck ... die fixes gingen eindeutig nicht weit genug und die Runner haben die berichteten Probleme wirklich [gehabt]'."
---

# Trust-anchor bootstrap is still circular in a live, genuinely fresh signature-mode project, despite the 2026-08-29 closure of the item describing the same defect

## What happened

`2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` was closed
2026-08-29 (commit `180d427a`, dispatch NVA-R32-TRUSTANCHORBOOT) as "found
already satisfied" -- verified via existing unit tests, no new code written.

The candidate the PO then used for a 3-runner greenfield test (built from
commit `ab0906d`, 16:43 CEST; stamped `0bf246d1`, 18:44 CEST) already
contained that exact closure commit. Yet BOTH the Codex/WSL and Claude/Windows
sessions -- run on genuinely independent physical machines/environments,
per Claude's own report's explicit independence argument -- hit the
IDENTICAL circularity the original item described: no sanctioned path to
write the first trust anchor into `project/critical-human-proof.json`
(GS-2-protected), only escapable via a human-run `git commit --no-verify`.

This is a live-verification gap, not a version-skew artifact: the fix
commit's timestamp precedes the candidate build by hours.

## Direction

Do NOT re-read the code and re-conclude "found already satisfied" a second
time -- that is what produced the false closure. Required this time:

1. Reproduce against a GENUINELY fresh fixture: no pre-existing machine-plane
   key pointer (`~/.agent-pipeline/machine.json` absent or pointing nowhere),
   `signature` mode, from a clean onboarding start.
2. Drive the actual `po-human-approval.mjs setup` / onboarding flow live
   (not just read `detectExistingLocalTrustAnchor()`/
   `freshCriticalHumanProofPolicyBytes()` and assume they compose correctly)
   and observe whether the first trust anchor actually lands in
   `project/critical-human-proof.json` without a `--no-verify` bypass.
3. If it still doesn't: the likely gap, per both runner reports, is that
   `po-human-approval.mjs setup`'s own write path is not exempted from the
   same GS-2 gate-strength protection it needs to satisfy, or the
   `collect-input` guidance action it fires does not actually complete the
   write it names.

## Acceptance criteria

- A live, scripted reproduction (not a code-reading exercise) of a fresh
  `signature`-mode onboarding through the FIRST successful human-override use
  completes with zero `--no-verify` bypass.
- The reproduction script/fixture is committed as permanent regression
  coverage, not a scratch throwaway -- this exact "closed via code-reading,
  still broken live" failure mode has now recurred at least twice this
  session (see also the Codex-restart item) and needs a durable guard against
  recurring a third time.

## Triage

- **Decision:** accepted, Nova A, high priority
- **Rationale:** confirmed live by 2 independent runners against the actual
  tested candidate; PO explicitly confirmed the finding 2026-08-29.
- **Date:** 2026-08-29

## Related

- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` (closed) --
  the item this supersedes; its closure verdict is now known incorrect for
  the live case.
- `2026-08-29-verify-contract-fails-until-configured-but-gs-10-blocks-configuring-it.md`
  -- the structurally identical GS-10 deadlock found the same session.
