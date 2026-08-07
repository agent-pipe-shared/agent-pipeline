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
5. **PO restatement, 2026-08-07, later the same day and sharper than the
   original:** an agent pipeline that cannot release *after the human has
   approved* is not worth having — so releasing must become possible, "auch
   mit Signatur oder Config je nach chat". That names the mechanism, not just
   the goal: the same admission shape ADR-0059 established for guard denials
   — signature always, chat whenever that is what the repository has genuinely
   committed to — should extend to the release path, rather than the release
   path keeping its own separate, human-only ceremony. Note what this does and
   does not ask for: the human still decides, and still signs in `signature`
   mode. What changes is that their decision, once made, is something the
   agent can *act on* end to end, instead of handing back a list of terminal
   commands. The PO deferred this deliberately on 2026-08-07 rather than
   improvising it during a release ("das nehmen wir uns noch mal vor"), and
   took only the branch push that session.
6. A frank cost/benefit PO review of whether five stacked layers is the
   intended security posture for every push, or whether some are redundant
   given the others (e.g., does GG-03 add real protection once a candidate
   already carries a verified per-commit, per-destination Ed25519 signature
   for `kind: push`?) — not proposing removal here, proposing the question
   be asked deliberately rather than left as accreted layers.
7. **PO requirement, 2026-08-07 evening, stated after walking the branch-push
   flow end to end:** *"das es zu umständlich ist und korrigiert werden muss.
   die eine signatur muss für alles reichen und auch da will man nicht 2
   befehle sondern nur den einen."* Two distinct requirements, both narrower
   and more testable than the earlier restatements, so they are recorded
   separately:

   **7a. One signature covers the work, not one action.** The same session
   signed twice within an hour — once for a guard maintenance window, once for
   a branch push — each binding its own candidate commit, each invalidated by
   the next commit. The second signature was needed *because* the first
   signature's own follow-up work produced commits. That is a loop: sign,
   fix, invalidate, sign again. A design has to answer what a signature
   legitimately covers. Candidate-bound is not obviously wrong — it is what
   makes the proof meaningful — but a session that lands ten commits under one
   approved intent should not need ten signatures, and today the binding is
   the only thing preventing that.

   **7b. One command, not two.** `prepare-critical` followed by
   `approve-critical` is not two decisions; it is one decision split across
   two invocations, and the split has already produced a live failure. In this
   very session `prepare-critical` failed on an invalid `--expires-at` (the
   validator demands an exact `toISOString()` round-trip, so a timestamp
   without milliseconds is rejected — and the error names no field), and
   `approve-critical` then signed the **stale** request still on disk without
   noticing. The confirmation text looked entirely normal; only the commit
   hash inside it revealed the wrong subject. Two commands with no coupling
   means a failed first step plus a successful second step yields a
   confidently signed wrong thing. Merging them is not only ergonomics — it
   removes that failure mode by construction.

   Two smaller findings from the same walkthrough, worth fixing whatever
   shape 7a/7b take:

   - **`prepare-critical`'s validation error is unattributed.** It says only
     `critical approval request is invalid`. Diagnosing it required reading
     the validator's source. Naming the offending field costs nothing.
   - **The push must be written with an explicit destination ref.**
     `git push origin <branch>` is refused; `git push origin
     HEAD:refs/heads/<branch>` is admitted. The guard's reasoning is sound and
     should stay — an attestation names a ref, and a command that does not
     name one cannot be matched against it without guessing — but nothing
     tells the operator this in advance, and the denial does not say it
     either. It is discoverable only by being refused.
8. **Layer 4 confirmed again, and it is outside this repository's control.**
   The Claude Code auto-mode classifier refused the fully authorized push —
   after the Pipeline's own gate had passed — and the only resolutions were
   the human running the command or granting a standing Bash permission rule.
   Candidate #2 above (pre-clear it at the settings level as a documented
   setup step) is the only lever this project has, and this session is a
   second measured instance of the same block.

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
