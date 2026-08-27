---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-hard-enforcement-layer-has-two-fail-open-paths
type: defect
owner: pipeline
status: closed
created: 2026-08-23
closed_at: "2026-08-27"
closure_repository: "self"
closure_commit: "ab347a74fd9750a17de610ed3d5ff958c313a336"
closure_evidence: "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs"
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
  **Superseded 2026-08-27 — this sentence is no longer true.** The
  "candidate future direction" named at the end of this Proposal was built:
  `observeAntigravityHardEnforcement()`
  (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, commit
  `ab347a74`) is a non-hook-based self-check that scans
  `.git/agent-pipeline/run/session-*/requires-bootstrap.lock` for a
  sufficiently fresh mtime and emits a typed warning when none is found. It
  detects its own layer's non-invocation from outside the layer, which is
  exactly the property a hook-based check cannot have. See the closure note
  at the end of this item.
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

## Closure (2026-08-27)

Closed three days ahead of its own `due:` re-triage date, because the residual
it was holding open has actually been addressed rather than merely re-dated.

Point 1 (the swallowed-error fix) was already confirmed landed at triage time,
commit `3ae43380`.

Point 2 is closed by commit `ab347a74`, "feat(preflight): detect whether the
Antigravity hard-enforcement hook fired this session". It implements the exact
shape this item's own Proposal named as the candidate future direction: a
self-check that is not itself a hook, verifying from outside the enforcement
layer that at least one hard-enforcement hook actually executed this session.
`observeAntigravityHardEnforcement()` is wired into
`pipeline-start-preflight.mjs` for the Antigravity runner and returns a typed
warning when no sufficiently fresh bootstrap lock is found. A future mtime is
deliberately not trusted as freshness.

**What this closure does NOT claim**, stated so it is not read as broader than
it is: the observation is Antigravity-scoped, which is correct for this item
but leaves the general question open — nobody currently answers "are the guards
firing in this session the ones this checkout defines". That gap is tracked
separately in
`backlog/items/2026-08-27-a-repository-agent-definition-is-inert-the-runtime-loads-the-installed-copy.md`,
where it was measured costing two dispatches their reports on 2026-08-27.
