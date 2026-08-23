---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-sandbox-containment-push-escape-route-unclosed
type: defect
owner: pipeline
status: open
created: 2026-08-23
source: "AGY-FIX-PUSHGUARD dispatch (evidence/dispatch-record-AGY-FIX-PUSHGUARD.json) and v3-bootstrap-authority.mjs's own removal-comment for the `.git/hooks/pre-push` workaround it used to install; spec gap closed by AGY-FIX-SPECGAP (specs/sprint-agy-runner/spec.md sec.8.2)"
due: 2026-08-30
---

# A structural push-escape route survives every PreToolUse command-line guard when Antigravity's own Layer-1 sandbox is not actually active

## Description

`specs/sprint-agy-runner/spec.md` sec.8.2 previously claimed the execution
host "enforces `--sandbox` isolation." It does not. `v3-bootstrap-authority.mjs`
only emits an unconditional, stderr-only, never-blocking warning stating that
whether OS-level filesystem and network containment (Layer 1, e.g. the
`--sandbox` flag) is actually active cannot be verified from inside the
session. The AGY-FIX-PUSHGUARD dispatch removed a prior workaround that had
tried to compensate for this by installing a `.git/hooks/pre-push` script;
that workaround was removed (not repaired) because it never reached a
consumer's actually-installed plugin path, and it failed OPEN whenever none
of its three named environment variables happened to be set. Its removal
leaves the underlying gap exactly where it always was: a PreToolUse
command-line guard (`guard-push.mjs`, `antigravity-pretool-guard.mjs`) only
ever sees the exact shell command text an agent submits as a tool call. A
push issued by a SUB-PROCESS the agent's command merely launches — a script,
a Makefile target, a wrapped CI-style runner invoked opaquely — is invisible
to any classifier that can only read the invoking command line, exactly the
"NOT COVERED" class `plugins/pipeline-core/lib/protected-test-paths.mjs`'s
own header already names for the identical effect on the write lane
("A write performed by a SCRIPT the command merely executes ... is invisible
to any classifier that can only read a command line"). If Layer-1 OS sandbox
containment is not actually active for a given Antigravity session (which
this session cannot itself verify — spec.md sec.8.2), a sub-process launched
inside that session can reach `git push` through a path the PreToolUse guard
union never inspects.

## Triggering situation

Root-cause analysis in the AGY-FIX-PUSHGUARD dispatch
(`evidence/dispatch-record-AGY-FIX-PUSHGUARD.json`), which closed the
per-checkout, fail-open `.git/hooks/pre-push` workaround but explicitly
documented in `v3-bootstrap-authority.mjs`'s own removal comment that the
sub-process-mediated push route it had targeted is "a residual, documented
gap of every PreToolUse command-line guard ... not a defect this validator,
or any other PreToolUse guard, can close by construction." Surfaced as a
named spec gap by the AGY-FIX-SPECGAP briefing while aligning
`specs/sprint-agy-runner/spec.md` sec.8.2 with delivered behaviour.

## Affected artifact

`specs/sprint-agy-runner/spec.md` sec.8.2 (Sandbox & Egress Restrictions);
`plugins/pipeline-core/hooks/guard-push.mjs` and
`plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs` (the guards that
cannot see this route); `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`
(carries the honest unverifiability warning, does not close the gap).

## Proposal

Per QG-06 ("gates are binary; warn-only needs an expiry date OR a
documented, justified calibration" — an undocumented gap is a finding, not a
mitigation), this item is the QG-06-compliant record for this residual risk:

- **Reason:** no PreToolUse command-line guard can, by construction, see a
  push issued by a sub-process the agent's own tool-call command merely
  launches; closing this needs enforcement at a layer the current guard
  union does not occupy (a real OS-level sandbox with verified containment,
  or a process-tree-aware push interceptor outside the PreToolUse hook
  model) — not achievable inside a PreToolUse guard itself.
- **Owner:** Product Owner (PO) — QG-06's own text names the gate owner as
  "the PO"; precedent for stating this literally in this repository:
  `docs/sprint-cyborg-tp-waiver.md` and
  `backlog/items/2026-08-23-antigravity-hard-enforcement-layer-has-two-fail-open-paths.md`.
- **Expiry:** 2026-08-30 (the `due:` field above) — the same 7-day review
  horizon the precedent item above used (created 2026-08-23, due
  2026-08-30, itself following
  `backlog/items/2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`'s
  7-day pattern, created 2026-08-09, due 2026-08-16). At expiry this item is
  re-triaged by the Elephant of the next Pipeline session per
  `backlog/README.md`'s triage rules — promoted to a scheduled fix (verified
  OS-level sandboxing as a hard precondition for `ready` status, or a
  process-tree-aware enforcement layer outside the PreToolUse model) or
  re-dated with a stated reason; silent lapse is the QG-06 violation this
  record exists to prevent.

Candidate future direction for a real fix (not built here, out of this
item's own scope): make Layer-1 sandbox containment a verified precondition
rather than an unverifiable warning — e.g. a runtime self-check that
confirms the process is actually running inside the claimed sandbox boundary
(not merely that an environment variable is set) before `ready` status is
granted, so an inert sandbox is detectable rather than silently assumed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
