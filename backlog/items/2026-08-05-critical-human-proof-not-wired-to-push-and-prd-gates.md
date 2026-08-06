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

# The Ed25519 critical-human-proof mechanism is not proof-bound for PRD approval

**Narrowed 2026-08-06 — see Triage.** The `push` half of this item's original
title is resolved; only the PRD-approval half remains. Original Description
kept below for the historical record of what was found; do not read it as
describing the current `push` state.

## Description (as filed, 2026-08-05 — push half now resolved, see Triage)

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

PO asked (2026-08-05, Sprint Nova session): Sprint Cyborg produced a way to
back the two critical human gates — PRD release and PUSH — with a genuinely
provable human audit that a session cannot fake; the PO asked why this is
unknown to sessions and not contractually secured. Investigated by reading
`guard-push.mjs` in
full, `pipeline-state.mjs`'s `approve-push`/`approve-plan` handlers,
`project-authority.mjs`'s authority resolution, and empirically confirming
via a direct `guard-push.mjs` stdin invocation (exit 0, not blocked) plus
`resolveProjectAuthorityPaths()`'s actual resolved output.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` (the enforcement gap for push),
`plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-plan` lacks
proof binding), `project/pipeline.yaml` vs. `.claude/pipeline.yaml` (manifest
drift), `CLAUDE.md` / `guardrails/git.md` (missing contract reference).

## Proposal (narrowed 2026-08-06 — only step 3 remains; see Triage)

~~1. Decide, as a PO-level policy call, whether `push` should actually require
   the Ed25519 proof for this repo~~ — done: `gates.push.approval: required`,
   `signature` clearance mode, ADR-0056.
~~2. Reconcile `.claude/pipeline.yaml` vs. `project/pipeline.yaml`~~ — done,
   both now agree on `required`.
3. **Remaining:** if PRD approval is meant to be proof-secured too, extend
   `critical-action-approval-request.mjs`'s bound kinds (or a parallel
   primitive) to `approve-plan` (`pipeline-state.mjs:4894-4957`), replacing
   the bare `--by <name>` string with the same verified-Ed25519 pattern now
   used for `push`/`deploy`.
~~4. Add an explicit pointer to `docs/po-approval-proof-contract.md` from
   CLAUDE.md / guardrails/git.md~~ — done, both now document
   `gates.push_approval`/ADR-0056 explicitly.

Step 3 is still architecture/guardrail-class work (touches
`pipeline-state.mjs`'s `approve-plan` handler, PO-gate-authority's own
path/profile/SHA binding mechanism, possibly a new ADR) — not a
same-session mechanical fix, and itself opens a design question: should PRD
approval get the same Ed25519 treatment as push/deploy, or is PO-gate-
authority's existing path/profile/SHA binding an intentionally different,
sufficient mechanism for that gate? That question is unanswered and is a PO
call, not something to resolve by just porting the push mechanism over.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** partially accepted and delivered; narrowed, stays open.
- **Rationale:** steps 1, 2, and 4 of the original proposal were delivered
  today by ADR-0055 (`docs/adr/0055-critical-human-proof-waiver.md`) and
  ADR-0056 (`docs/adr/0056-push-approval-mode.md`) as part of unrelated
  session work, not as a direct response to this item — found and
  reconciled by an autonomous backlog-triage pass, 2026-08-06 night.
  Independently verified live (not just documented): `project/pipeline.yaml`
  and `.claude/pipeline.yaml` both read `approval: required`;
  `guard-push.mjs:1599-1694` demands a verified Ed25519 proof via
  `authorizeRecordedPush` whenever the gate is `required` and no waiver
  applies; `pipeline.user.yaml` sets `push_approval: "signature"`, the
  strongest mode; `CLAUDE.md`'s "Push policy" bullet and
  `guardrails/git.md:82` both cite ADR-0056 by name. ADR-0055's own
  Follow-up section already names this exact item and states in so many
  words that it closes only the push half: *"That is the remaining half of
  `backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-
  gates.md` and is out of scope here — this ADR closes the push half."*
  Step 3 (PRD/`approve-plan` proof binding) is confirmed still unimplemented:
  `pipeline-state.mjs:4894-4897`'s `approve-plan` handler still takes a bare
  `--by <name>` with no cryptographic binding.
- **Assignment (if accepted):** steps 1/2/4 delivered by ADR-0055/ADR-0056,
  Sprint Nova session, 2026-08-06. Step 3 unassigned — needs the PO design
  call above before dispatch.
- **Date:** 2026-08-06
