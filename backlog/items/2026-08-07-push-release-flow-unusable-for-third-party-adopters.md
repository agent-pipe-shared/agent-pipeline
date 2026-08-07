---
schema: pipeline.backlog-item.v1
id: pipeline.push-release-flow-unusable-for-third-party-adopters
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "PO, live during the 0.5.2 main-release session, 2026-08-07 — verbatim: 'Eine Entwickler Agent-Pipeline die nicht pushen und releasen kann ist unbrauchbar, außerdem viel zu unhandlich mit so vielen Freigaben.'"
---

# The push/release flow is unusable for a third-party adopter as shipped

## Description

An agentic development pipeline whose own agent cannot push a branch or
release a candidate without the human running commands in their own terminal,
multiple times, across multiple independent and non-obvious layers, does not
deliver on its core value proposition. Measured directly in this same
session, for one candidate, one branch push and one main-release push:

1. **Push-approval signature** (`gates.push_approval: signature`, ADR-0056)
   — a detached Ed25519 proof the agent is cryptographically incapable of
   producing, by design. Correct and intentional on its own.
2. **Two more PO-only artifact-producing steps just to prepare that
   signature** — `po-approval-gate.mjs prepare-critical` turned out to also
   be agent-blocked in practice (`GUARD-CROSS-REPO-MUTATION`, the external
   signing directory sits outside the project root), despite its own
   docstring saying "the agent may prepare this." The PO had to run both the
   prepare and the sign step personally, each a multi-flag CLI invocation
   the PO had no way to construct without the agent dictating it live.
3. **`GG-03` double-confirmation override** for the actual `main` push —
   its own separate ritual (explain, confirm, fixed phrase `OVERRIDE
   GG-03`, one-time token), independently of the signature already
   verified in step 1.
4. **The Claude Code harness's own "auto mode classifier"**, opaque to the
   agent, blocked the actual `git push`/`git restore` invocations a further
   two times in this same session, on top of everything the Pipeline itself
   already gated — discovered only by attempting the command, with no way
   for the agent to anticipate or bundle it with the Pipeline-side
   confirmation.
5. Net result: the PO ended up running the actual `git push` to `main`
   personally, in their own terminal — the exact operator action the whole
   apparatus above exists to route through the agent under a verified
   signature. The agent could not complete the one action all of the
   above was building toward.

None of the individual layers is unreasonable in isolation — the signature
requirement is a deliberate, load-bearing security decision (ADR-0055/0056),
and GG-03 is a real second line of defense against an unattended-agent
main-branch overwrite. The problem is the **composition**: five
independently-discovered, non-obvious, mostly-undocumented-for-agents
layers stacked on one release, several of which were assumed rather than
verified because nothing describes the real, current shape of this flow in
one place. This is a distinct, compounding defect from any one layer's own
design.

## Triggering situation

Live during the 0.5.2 release session (2026-08-07): every step above was
discovered by trial and error in the session — including two confirmed wrong
assumptions by the agent (which script/step is agent-executable; which of
two candidate external directories held the trust-anchored key), corrected
only after live failures (`GUARD-CROSS-REPO-MUTATION`, `CRITICAL-PROOF-
TRUST-ANCHOR-MISMATCH`). See also
`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`
(a related, narrower guard-scope gap found the same session) and the
2026-08-07 Nova IV section of `docs/state.md` for the session's own account.

## Affected artifact

The composition of `plugins/pipeline-core/hooks/guard-push.mjs`,
`plugins/pipeline-core/hooks/guard-git.mjs` (GG-03), the Claude Code harness
auto-mode classifier (outside this repo's control), and the
`po-human-approval.mjs`/`po-approval-gate.mjs`/`pipeline-state.mjs
approve-push` script family. No single file is "the bug"; the end-to-end
path a PO or agent must actually walk is.

## Proposal

Not designed here — this item exists to make the finding durable and force
a deliberate PO decision, not to freelance a fix for guardrail-class flow
design. Candidates for a future session to evaluate, explicitly not a
commitment to any of them:

1. **One authoritative, current document** ("How a push/release actually
   works, end to end, today") that names every layer above, which ones are
   agent-executable, which are PO-only, and the exact commands — so this
   is read once per session rather than rediscovered live. This alone would
   have prevented both wrong-assumption incidents in this session.
2. Evaluate whether the harness classifier's blocking of an
   already-Pipeline-authorized command is something the PO can pre-clear at
   the settings level (the classifier's own message suggests a Bash
   permission rule can allow this) — if so, document that as the standard
   setup step for anyone running this Pipeline, not a per-session surprise.
3. Evaluate whether `prepare-critical`'s external-directory write genuinely
   needs the full cross-repo-mutation refusal, or whether a narrower,
   config-declared exception (raised independently in
   `2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`'s
   sibling finding) would let the agent do the one half of the ceremony its
   own design intent already says it may.
4. A frank cost/benefit PO review of whether five stacked layers is the
   intended security posture for every push, or whether some are redundant
   given the others (e.g., does GG-03 add real protection once a candidate
   already carries a verified per-commit, per-destination Ed25519 signature
   for `kind: push`?) — not proposing removal here, proposing the question
   be asked deliberately rather than left as accreted layers.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open, partially addressed.
- **Rationale:** candidate #1 of this item's own Proposal — "one
  authoritative, current document" naming every layer, agent-executable vs.
  PO-only, exact commands — is now written:
  [`docs/push-release-flow.md`](../../docs/push-release-flow.md), pointed to
  from CLAUDE.md's bootstrap-read "Push policy" bullet and "Where things
  live" section so it is read once per session rather than rediscovered
  live, as this item's own text asked for. This closes the *documentation*
  half of the finding, not the underlying composition: candidates #2
  (whether the harness classifier can be pre-cleared at the settings level),
  #3 (whether `prepare-critical`'s cross-repo refusal can be narrowed), and
  #4 (a deliberate PO cost/benefit review of whether five stacked layers is
  the intended posture) are all still open and are explicitly PO-territory
  calls per the item's own Proposal — none should be picked unilaterally by
  an agent. The PO's underlying verdict ("unusable for third parties as
  shipped") stands until at least one of #2-#4 is actually decided and
  acted on, not just documented.
- **Assignment (if accepted):** #2 and #3 are candidates for a future
  Goldfish/design dispatch once the PO makes the call in #4; #3 overlaps
  `backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`'s
  narrower scope and should be designed together with it rather than
  separately, since both are instances of "guard drawn at a whole-directory
  boundary rather than at what actually needs protecting."
- **Date:** 2026-08-07
