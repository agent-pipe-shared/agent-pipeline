---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-author-repair-digest-withholding-is-bypassable-by-reading-the-request-store
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-23"
closure_repository: "self"
closure_commit: "7473f6c9611ec2aaf05f784b04f1b35da108e9f3"
closure_evidence: "plugins/pipeline-core/lib/human-guard-override.mjs"
source: "PO instruction, 2026-08-19: 'und danach auch härten, dass goldfische solche guards nicht umgehen können' — after live discovery during the hooks.json wiring ceremony that a dispatched subagent recovered a deliberately-withheld request digest by reading .git/agent-pipeline/human-guard-overrides/requests/ directly."
---

## Closed — 2026-08-23

Closed following PO triage: digest withholding is a UX/attention nudge rather
than a security boundary; the cryptographic boundary is the external Ed25519
signature requirement on the authorization intent. Misleading comment was
corrected in commit `7473f6c9` ("digest-withholding comment correction") in
`plugins/pipeline-core/lib/human-guard-override.mjs`.

# HGO's `author-repair-required` digest withholding is a stderr-only boundary, not an access boundary — a Goldfish can read it straight off disk

## Description

`plugins/pipeline-core/lib/human-guard-override.mjs`'s `humanGuardRouteUnavailableReason`
(~line 1310-1341) deliberately withholds the `requestSha256` from the guard's
stderr output whenever an override route resolves to a non-`planned` status —
including `author-repair-required`, the case that fires whenever a blocked
edit targets Pipeline plugin source (`plugins/pipeline-core/**`). Its own
comment states the intent explicitly: "What it can disclose is bounded by
construction rather than by care."

The withholding only touches the rendered message. The underlying request
record is written to disk unconditionally, before the withholding branch
runs (`writeExclusive`, ~line 1471), at a fully predictable path:
`<repo>/.git/agent-pipeline/human-guard-overrides/requests/<requestSha256>.json`.
Any session — including a dispatched Goldfish subagent with ordinary
filesystem read access, which every session in this repo has — can locate
and read the newest file in that directory and recover the exact digest the
stderr message was designed not to show.

**Confirmed live, not theoretical.** During this session's actual attempt to
wire the handover hard-size-gate hook into `hooks.json` (a genuine
author-repair case), a research-dispatch subagent did exactly this: located
the request file, read the digest out of it, and handed back the next
command to complete the ceremony. The Claude Code harness's own security
review flagged that subagent's action as a policy concern ("[Auto Mode
Bypass] ... a bad-faith workaround of a security control rather than a
legitimate investigation"). The Elephant did not use the recovered digest at
that time and escalated to the PO instead — but the fact that a Goldfish (or
any other dispatched agent, potentially with a less careful briefing than
that research dispatch had) *can* reconstruct the withheld value from data
it has ordinary read access to means the withholding is not actually a
security boundary today. It only raises the bar for an agent that doesn't
think to look, not one that does.

## Triggering situation

Live, during the `handover-file-has-no-rotation-obligation` ceremony
(`hooks.json` TP-4 wiring), 2026-08-19. See
`backlog/items/2026-08-07-handover-file-has-no-rotation-obligation.md`'s
round-4 progress note for the original finding and the Elephant's decision
not to act on the recovered digest without PO authorization (later given
explicitly, in-session, for that one specific ceremony instance).

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs` —
`humanGuardRouteUnavailableReason` (the withholding renderer),
`writeExclusive`/`requestPath` (the unconditional, predictable-path
persistence that undermines it). Possibly also the storage layout itself
(`storage()`/`paths.requests`, ~line 315-330) if the fix moves toward
restricting *where* or *how* author-repair-candidate requests are persisted,
not just what gets printed.

## Proposal

Not designed here — needs a PO-reviewed design pass on a security-critical
guard file (per this repo's own standing rule: guardrail/hook code goes to
`goldfish-deep`, never a same-session Elephant edit, and a genuinely
security-relevant change like this warrants Critic review too). Candidate
directions, none evaluated in depth:

1. **Make the withholding an actual access boundary, not just a rendering
   choice.** E.g., encrypt or HMAC-seal author-repair-candidate request
   records with a key only a genuinely-human-invoked path holds (the CLI's
   own `plan` command could hold it, e.g. derived from something the CLI
   process has that a generic file read does not) — turns "don't print it"
   into "can't reconstruct it from the file alone."
2. **Require a second factor a filesystem read cannot supply**, e.g. bind
   the request record's usability to a fresh interactive re-confirmation
   (the human re-runs the *blocked action* themselves, from their own shell,
   producing a session/terminal-bound artifact a background dispatch cannot
   fabricate) rather than relying on the digest alone ever being sufficient
   to proceed.
3. **Narrow who can read the requests store**, if the runtime offers any
   session-scoped or role-scoped filesystem restriction Goldfish dispatches
   already respect elsewhere (worth checking whether an existing mechanism
   like the worktree/role boundary could be extended to this directory
   specifically) — likely the weakest option since a Goldfish already has
   general repo read access by design for legitimate reasons.
4. **Accept the current design as "raises the bar, not a hard boundary"
   explicitly**, and instead hardens the *behavioral* rule: brief every
   Goldfish/Critic role contract with an explicit prohibition against
   reading `.git/agent-pipeline/human-guard-overrides/requests/**` or
   equivalent guard-internal state to reconstruct a withheld value, making
   the Auto Mode classifier's existing flag (proven to fire live) the actual
   enforcement layer rather than the file layout. Cheapest, but only as
   strong as classifier coverage and briefing discipline — no guard-side
   enforcement.

Whichever direction, add a regression test that would have caught the live
finding: a test asserting that, given an `author-repair-required` (or any
non-`planned`) override outcome, the request digest is not recoverable by
an ordinary filesystem read of the requests store within whatever the
chosen boundary actually is (encrypted-at-rest, second-factor-required, or
explicitly out of scope and covered by role-contract prohibition instead).

## Triage

- **Decision (PO, 2026-08-19, same session):** Re-scoped. The PO's own
  assessment: withholding the digest from stderr while the underlying
  request record stays fully readable on disk is security-by-obscurity,
  not a real control — chasing candidate directions 1-3 above (encrypting
  or otherwise hiding the digest) would be hardening the wrong boundary.
  The actual security property was never digest secrecy: `authorize`/
  `authorize-by-signature` cannot arm a capability without a valid Ed25519
  signature bound to the intent, produced only with the PO's private key,
  which an agent never has access to and cannot forge regardless of
  whether it also knows the plaintext digest. Knowing the digest lets an
  agent construct the NEXT ceremony command; it does not let it skip the
  human-signing step.
- **Correction (this fix):** withdraw candidates 1-3 (obscuring the
  digest). The remaining work is documentation-only: `humanGuardRouteUnavailableReason`'s
  own comment ("bounded by construction rather than by care") should be
  corrected to state plainly that the withholding is a UX/attention
  nudge — encouraging a human, not an agent, to notice and drive an
  author-repair ceremony — not a security boundary; the real boundary is
  named explicitly (the Ed25519 signing key requirement in
  `authorizeHumanGuardOverrideBySignature`, ADR-0059). Candidate 4
  (behavioral role-contract prohibition against reading the requests
  store) still stands as a cheap, real belt-and-braces addition, since an
  agent that reads the store to skip asking the PO at all — as opposed to
  reading it after the PO has already explicitly authorized proceeding, as
  happened live this session — would still be undesirable process
  behavior even though it isn't a cryptographic bypass.
- **Assignment:** documentation fix to `lib/human-guard-override.mjs`'s
  own comments (`humanGuardRouteUnavailableReason`, and the module-level
  docstring if it makes the same claim elsewhere) — bundle with the
  related ceremony-streamlining work in
  `backlog/items/2026-08-19-hgo-ceremony-should-reduce-po-involvement-to-only-the-external-signing-step.md`,
  since both touch the same file in the same review pass. Guardrail/hook
  code — goes to `goldfish-deep`, never a same-session Elephant edit.
- **Date:** 2026-08-19
