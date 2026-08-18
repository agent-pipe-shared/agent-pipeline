---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-signature-ceremony-requires-more-human-steps-than-the-key-actually-needs
type: workflow-improvement
owner: pipeline
status: open
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

- **Decision:** {{accepted | deferred | rejected | merged-into-<filename>}}
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
