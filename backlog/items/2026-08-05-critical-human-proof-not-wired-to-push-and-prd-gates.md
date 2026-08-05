---
schema: pipeline.backlog-item.v1
id: pipeline.critical-human-proof-not-wired-to-push-and-prd-gates
type: defect
owner: pipeline
status: open
created: 2026-08-05
source: "PO question during Sprint Nova session, 2026-08-05: asked whether the ed25519 human-proof mechanism (built for Sprint Cyborg) needed one-time setup before this session's branch push. Investigation found it exists but is not enforced for either of the two human gates it was meant to secure."
due: 2026-09-05
---

# The Ed25519 critical-human-proof mechanism is not actually enforced for either "push" or PRD approval

## Description

Agent-Pipeline has a fully implemented, tested, cryptographic proof-of-human
primitive (`plugins/pipeline-core/lib/po-approval-proof.mjs`,
`critical-action-approval-request.mjs`, CLI via `pipeline-state.mjs
approve-push` / `po-approval-request.mjs` / `po-approval-gate.mjs` /
`po-human-approval.mjs`, contract documented in full at
`docs/po-approval-proof-contract.md`). It signs a candidate-bound decision
digest with an Ed25519 key held **outside the repository**, verified against
an externally configured trust anchor, fail-closed if absent. `project/
critical-human-proof.json` declares `push`, `deploy`, and `publication` as
mandatory proof kinds.

In practice, for this repo, **it is not live for push**: the actually
resolved project authority (`resolveProjectAuthorityPaths()` →
`project/pipeline.yaml`, confirmed via direct invocation) sets
`gates.push.approval: standing-approved`. `guard-push.mjs`'s approval check
(around line 1403) short-circuits entirely under `standing-approved` — it
never even reads `critical-human-proof.json`'s declaration that `push`
requires proof. Two contradictory policy statements exist in the repo at
once, and the weaker one silently wins with no warning surfaced anywhere.

There is also a **stale duplicate manifest**: `.claude/pipeline.yaml` (not
the live authority) sets `gates.push.approval: required` — the opposite of
what's actually enforced. Anyone inspecting `.claude/pipeline.yaml` directly
(as this session initially did) draws the wrong conclusion about what's
enforced.

For **PRD approval**, it's further from wired: `pipeline-state.mjs
approve-plan` takes a plain `--by <name>` string with zero cryptographic
binding — no reference to the proof primitive at all. The primitive has so
far only ever been wired for one historical case (a Cyborg-sprint
threat-model decision); general PRD-approval was never migrated onto it.

Finally, **CLAUDE.md and `guardrails/git.md` never mention this mechanism**.
A session that only reads the mandatory bootstrap canon (as this session did)
has no way to discover the mechanism exists, let alone that it requires a
one-time out-of-repo setup step.

## Triggering situation

PO asked (2026-08-05, Sprint Nova session, verbatim): "wir haben mit dem
cyborg sprint einen weg entwickelt um die beiden kritischen Human Gates (PRD
Freigabe und PUSH) mit einem wirklich beweisbaren human audit zu belegen, den
eine session nicht faken kann... prüfe warum das unbekannt ist und nicht
vertraglich abgesichert wird." Investigated by reading `guard-push.mjs` in
full, `pipeline-state.mjs`'s `approve-push`/`approve-plan` handlers,
`project-authority.mjs`'s authority resolution, and empirically confirming
via a direct `guard-push.mjs` stdin invocation (exit 0, not blocked) plus
`resolveProjectAuthorityPaths()`'s actual resolved output.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` (the enforcement gap for push),
`plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-plan` lacks
proof binding), `project/pipeline.yaml` vs. `.claude/pipeline.yaml` (manifest
drift), `CLAUDE.md` / `guardrails/git.md` (missing contract reference).

## Proposal

1. Decide, as a PO-level policy call, whether `push` should actually require
   the Ed25519 proof for this repo (switch `project/pipeline.yaml`'s
   `gates.push.approval` to `required`, complete the one-time `$PO_DIR` setup
   described in `docs/po-approval-proof-contract.md`) or whether
   `standing-approved` is the deliberately chosen posture for this
   self-application repo specifically — if the latter, `project/
   critical-human-proof.json` listing `push` as a required kind is itself the
   thing to correct (remove it, or document the standing-approved carve-out
   explicitly).
2. Reconcile `.claude/pipeline.yaml` vs. `project/pipeline.yaml` — a stale,
   disagreeing duplicate manifest is a hazard independent of the proof
   question.
3. If PRD approval is meant to be proof-secured too, extend
   `critical-action-approval-request.mjs`'s bound kinds (or a parallel
   primitive) to `approve-plan`, replacing the bare `--by <name>` string.
4. Add an explicit pointer to `docs/po-approval-proof-contract.md` from
   `CLAUDE.md` and/or `guardrails/git.md` so a session doing normal bootstrap
   can discover the mechanism exists at all.

This is architecture/guardrail-class work (touches `guard-push.mjs`,
manifest authority resolution, possibly a new ADR) — not a same-session
mechanical fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
