---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-hard-enforcement-layer-has-two-fail-open-paths
type: defect
owner: pipeline
status: open
created: 2026-08-23
source: "Critic review finding F8, specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md"
due: 2026-08-30
---

# The Antigravity hard-enforcement layer has two fail-open paths, one fixed here and one residual

## Description

Two related fail-open conditions in the Antigravity hard-enforcement layer
(`specs/sprint-agy-runner/spec.md` sec.3) were found together as Critic
finding F8:

1. `plugins/pipeline-core/hooks/antigravity-start-hint.mjs` wrapped its whole
   body in a catch that swallowed every error and emitted `{}`, silently
   skipping the write of the session bootstrap lock that
   `antigravity-pretool-guard.mjs`'s "Mandatory Session Bootstrap" hard block
   depends on. **Fixed** by this item's own closure commit: the hook now
   stays exit-0 (a non-zero `PreInvocation` exit cancels the whole tool
   invocation per spec sec.3, so that path stays closed) but reports failure
   via stderr and the hook's own `injectSteps`/`ephemeralMessage` channel
   instead of silence.
2. **Residual, not fixed here:** if the Antigravity CLI daemon cannot resolve
   `node` on its `$PATH` (background daemons launched by an IDE/desktop
   app/systemd typically do not source `.bashrc`, so an `fnm`/`nvm`-managed
   `node` is invisible to them), no hook process ever starts at all —
   including the fix in point 1. There is no code fix for this from inside
   the hook; the daemon never invokes it. Today's only mitigation is the
   manual `sudo ln -s $(which node) /usr/local/bin/node` workaround
   documented in `GEMINI.md`'s Prerequisites section, and there is no
   runtime detection that flags a session running with the hard-enforcement
   layer silently absent.

## Triggering situation

Critic review of the `sprint-agy-runner` implementation,
`specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`,
finding F8 (spec-ref: QG-06; spec sec.9 checklist row 2).

## Affected artifact

`plugins/pipeline-core/hooks/antigravity-start-hint.mjs` (point 1, fixed);
`GEMINI.md` Prerequisites section and the Antigravity daemon/`node`-PATH
precondition it documents (point 2, residual, no code fix possible from this
repository).

## Proposal

Per QG-06 ("gates are binary; warn-only needs an expiry date OR a
documented, justified calibration" — an undocumented gap is a finding, not a
mitigation), this item is the QG-06-compliant record for the residual risk
in point 2:

- **Reason:** the Antigravity hard-enforcement layer (PreToolUse guards,
  the mandatory-bootstrap hard block) is entirely inert whenever the
  Antigravity daemon cannot resolve `node`; nothing in-repo can detect or
  fix this from inside a hook that never runs.
- **Owner:** Product Owner (PO) — QG-06's own text names the gate owner as
  "the PO"; `docs/sprint-cyborg-tp-waiver.md` is this repository's precedent
  for stating that literally ("**Owner:** Product Owner (PO)").
- **Expiry:** 2026-08-30 (the `due:` field above) — a 7-day review horizon,
  the same delta the precedent item
  `backlog/items/2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`
  used (created 2026-08-09, due 2026-08-16). At expiry this item is
  re-triaged by the Elephant of the next Pipeline session per
  `backlog/README.md`'s triage rules — promoted to a scheduled fix (e.g. a
  runtime self-check that detects "hooks never fired this session" and
  surfaces it some other way an agent can observe, since a hook-based check
  cannot detect its own non-invocation) or re-dated with a stated reason;
  silent lapse is the QG-06 violation this record exists to prevent.

Candidate future direction for a real fix (not built here, out of this
item's own scope): a non-hook-based self-check — something the agent or a
skill runs at session start that independently verifies at least one
hard-enforcement hook actually executed this session (e.g. checking for a
freshly written lock/marker file with today's timestamp), so a fully inert
enforcement layer is at least detectable from inside the session rather than
purely from the operator noticing nothing was ever blocked.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** Point 1 (the swallowed-error fix) is confirmed landed
  (commit `3ae43380`). Point 2 is, by this item's own design, a QG-06
  residual-risk record with a self-scheduled review horizon, not a defect
  awaiting a session fix — it is deliberately re-triaged at its own `due:`
  date (2026-08-30) rather than closed or reassigned now. That date has not
  been reached yet (today: 2026-08-24), so no PO decision is due this
  session; re-triage this item when it expires, per its own Proposal text.
- **Assignment (if accepted):** n/a — QG-06 record, self-scheduled re-review
  at expiry.
- **Date:** 2026-08-24
