---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-signature-ceremony-requires-more-human-steps-than-the-key-actually-needs
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-18
source: "PO, 2026-08-18, live during two TP-3 human-guard-override ceremonies run this session (registering worktree-create-tests / session-cleanup-owner-nonce-tests in verify.mjs). The PO ran all four CLI steps (plan handed to the agent; prepare-authorization, emit-signature-digest, sign-intent, authorize-by-signature run by the PO) and objected explicitly: 'wiederspricht klar meinen design vorgaben nur so wenig PO gates wie wirklich nötig und nur der teil mit dem externen key ist der echte schutz'."
---

# The HGO signature-mode ceremony asks the PO to run three steps that don't need the key

## Description

`human-guard-override.mjs`'s signature-mode ceremony has four CLI steps:
`plan` (agent-executable), `prepare-authorization`, `emit-signature-digest`,
`authorize-by-signature`. Only the middle action — signing the intent digest
via `po-human-approval.mjs sign-intent` — actually requires the external
Ed25519 private key. `prepare-authorization` and `emit-signature-digest` are
pure digest/selection computation from data already in the repository, and
`authorize-by-signature` only verifies an already-produced proof and writes
the armed capability into repo-local state (`.git/agent-pipeline/...`) — none
of the three needs the key or could forge a valid signature without it.

Despite that, all three are currently labelled "outside this session" in
every guard denial's printed guidance, and
`authorizeHumanGuardOverride()`'s own code (`human-guard-override.mjs:2300-2316`)
explicitly documents this as intentional defense-in-depth: "harmless while
`gates.push_approval` is 'chat' ... disqualifying while it is 'signature' ...
the calling guards already stop offering this route in that mode ... but
this function must refuse it outright too, never relying on the caller alone
to keep it out of reach."

## Triggering situation

Live during this session's local-candidate work: two separate TP-3 ceremonies
(registering two new test suites in `harness/scripts/verify.mjs`, commits
`93911e70` and `51d483a7`) required the PO to manually copy-paste and run
three of four CLI commands each time, typing no different information than
the agent already had. The PO flagged this directly as contradicting their
own standing design principle: PO gates should be as few as genuinely
necessary, and the external key is the actual (and only necessary) protection
boundary.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs` (`authorizeHumanGuardOverride()`
and the CLI-argv guidance strings printed by every denying guard —
`guard-testpath.mjs`, `guard-gate-strength.mjs`, `guard-lifecycle-ready.mjs`,
`guard-maintenance-window.mjs`), `docs/adr/0059-*.md` (the ADR this design
implements), `docs/push-release-flow.md` (documents the current 4-step flow).

## Proposal

Not worked out — PO explicitly said "bei Gelegenheit" (not urgent). Possible
direction to evaluate: let the agent run `prepare-authorization` and
`emit-signature-digest` itself (both are read-only digest computation against
data the agent can already see), and — separately, more carefully — evaluate
whether `authorize-by-signature` could also be agent-run once a valid,
externally-produced proof file exists, since verifying a signature the agent
could not have forged is not the same privilege as producing one. Requires a
security-focused design pass (this is exactly the kind of guardrail change
ADR-0059's Decision 1 defended in depth) and a Critic review before any
implementation — not an ad hoc edit.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, delivered same day — PO decision #12 of the
  2026-08-18 20-item batch, implemented in commit `08702175`
  (`Dispatch: NVA-W3-12`).
- **Rationale:** the Proposal's first half — let the agent run
  `prepare-authorization` and `emit-signature-digest` itself, since both
  are pure local digest computation against data already in the
  repository and neither touches the external key or arms a capability —
  was accepted and implemented exactly as proposed. Only
  `authorize-by-signature` (which the PO explicitly named as "the real
  protection") still requires a human/external-key touch; the guard
  guidance strings across all four surfaces that offer this route were
  updated to reflect the new in-session/outside-this-session split. The
  Proposal's second half — whether `authorize-by-signature` itself could
  also become agentic, since verifying a signature the agent could not
  have forged is arguably not the same privilege as producing one —
  remains explicitly undecided, per the Proposal's own words: "requires a
  security-focused design pass ... and a Critic review before any
  implementation." The PO's own framing was "bei Gelegenheit" (not
  urgent), so this residual, harder question is left for a future
  dedicated dispatch rather than spun into a new backlog item now.
- **Assignment (if accepted):** delivered — no further assignment for the
  accepted half. The undecided residual question is available for a
  future PO-scheduled security-design pass.
- **Date:** 2026-08-19

## Closure, 2026-08-19

The item's own title claim ("requires more human steps than the key
actually needs") is now false: of the four CLI steps, only
`authorize-by-signature` — the one that actually needs the external
Ed25519 key — remains human-run. Re-verified live: commit `08702175`
confirmed present, `codex-pretool-guard.test.mjs` (37/37),
`guard-gate-strength.test.mjs` (36/36), `guard-testpath.test.mjs` (13/13)
all still pass per the commit's own evidence. Closing; the harder residual
design question (agentizing signature verification itself) was
deliberately not carried forward into this closure since the PO's own
framing already treats it as non-urgent, deferred future work rather than
part of this item's own scope.
