---
schema: pipeline.backlog-item.v1
id: pipeline.technical-lock-for-pipeline-consent-before-onboarding-complete
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-07
source: "PO handover from a separate session (agent-pipeline-share_phoenix), submitted through the PO's own channel, 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
---

# No technical lock between "PO consented to Agent Pipeline" and "onboarding actually completed" -- an agent can silently skip straight to unguarded implementation

## Description

In a separate session (project `agent-pipeline-share_phoenix`), the PO gave
explicit consent to use Agent Pipeline. A real, independent plugin-registration
bug (`pipeline-core` double-registered -- once user-scope, once local-scope,
the local-scope binding stale and pointed at this project instead) put the
bootstrap preflight into a `status: "plugin-refresh-required"` state with
`nextAction: null` and no documented recovery path in the skill's own
`references/*.md`. The agent partially mis-diagnosed the fix (ran a `disable`
in the wrong cwd), recovered, but then never re-ran preflight to confirm the
fix actually worked. When the PO said "focus on yourself" (meaning: leave the
unrelated Phoenix project alone), the agent interpreted that as license to
abandon the Pipeline path entirely for the CURRENT repo and went straight into
unguarded `Write`/`Edit` implementation (game files) -- with no PRD/Spec, no
design discussion, no re-confirmation that skipping Pipeline was actually
wanted. The PO's original "yes, install it" consent was never withdrawn.

## Triggering situation

Any session where (a) the PO has given Pipeline-adoption consent, (b) the
bootstrap/onboarding chain does not reach a `ready` state on the first attempt
(any cause -- a plugin-registration conflict, a transient tool failure, an
unhandled preflight status), and (c) a later, narrower instruction from the PO
(here: "leave the other project alone") gets over-generalized by the agent into
"abandon Pipeline governance altogether," without the agent re-checking
preflight or re-confirming that broader interpretation.

## Core gap

Between "PO consent given" and "onboarding actually complete," enforcement
today rests entirely on prose in the SessionStart hook and the agent's own
discipline -- there is no `PreToolUse` technical barrier stopping `Write`/`Edit`
on project files during that window. A session that quietly drifts out of the
bootstrap flow (for any reason, not just this one) can start unguarded
implementation with nothing stopping it.

## Proposal

A `PreToolUse` hook that blocks `Write`/`Edit` on project files whenever a
local marker records "Pipeline consent given, onboarding not yet complete."
The marker is written at the exact moment consent is given and cleared ONLY by
the real completion of `project-onboarding-v3.mjs` (or an explicit,
PO-confirmed "work without Pipeline" override) -- so a session that drifts out
of the bootstrap chain for any reason is technically blocked from silently
falling back to unguarded implementation, rather than relying on the agent
correctly re-deriving that Pipeline was still wanted from an unrelated
instruction.

## Triage — 2026-08-18

- **Decision:** Accepted as open; dispatch-ready when capacity allows. No PO design judgment blocks starting it.
- **Rationale:** Re-checked 2026-08-18: no marker-file + `PreToolUse` write-lock mechanism exists in Phoenix's `hooks/hooks.json`. Nova only documents the single-consent bootstrap flow in prose (`plugins/pipeline-core/skills/pipeline-start/SKILL.md:80-83`), with no technical lock either — nothing to port. The item's own Proposal already names a concrete, bounded mechanism (a local marker written at consent, cleared only by real `project-onboarding-v3.mjs` completion or an explicit PO override, gating `Write`/`Edit`), so this can go to an ordinary dispatch without further PO design input.
- **Assignment (if accepted):** unassigned; PO previously flagged this as "not relevant right now, but interesting hardening for the backlog" — still true, priority decision only, not a design decision.
- **Date:** 2026-08-18

## Triage — updated 2026-08-19

- **Decision:** stays open — partial progress landed, real blocker remains.
- **Rationale:** The onboarding-consent marker + PreToolUse lock guard file landed (commit `286673e2`), matching this item's own Proposal. Its `hooks.json` registration step is explicitly blocked by TP-4 per the commit's own message — needs a TP-4-scoped HGO ceremony (the PO's Ed25519 key, outside this session) to complete wiring. Not closeable until that ceremony runs.
- **Date:** 2026-08-19
