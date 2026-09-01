---
schema: pipeline.backlog-item.v1
id: pipeline.a-captured-resume-hint-card-reds-the-verify-gate-until-another-session-consumes-it
type: defect
owner: pipeline
status: open
created: "2026-08-31"
sprint: nova-b
done_when: manual
source: "Observed live on 2026-08-31 during release preparation. The Elephant captured a Resume-Hint card for compact safety; the next full verify.mjs run went red on resume-consumption-check, and push-prepare.mjs requires green candidate-bound verify evidence."
---

# A captured Resume-Hint card reds the verify gate until another session consumes it

## Description

`check-resume-consumption.mjs --any-session` fails whenever a Resume-Hint card is
available and no session has recorded a consumption receipt for it:

```
FATAL (RH-CHECK-RH-RECEIPT-ABSENT-ANY): an available Resume-Hint card at bootstrap
has no matching consumption receipt from ANY session (0 receipt(s) inspected)
```

That check is registered in `verify.mjs` as `resume-consumption-check`, so the
whole verify gate goes red. Consumption happens at a LATER session's bootstrap by
construction — the card exists precisely to carry context across a session
boundary. So the session that captures a card cannot produce a green verify run,
and `push-prepare.mjs` requires green candidate-bound verify evidence before a
push-approval ceremony may start.

The result is a closed loop: **capture a card → verify red → no ceremony**, and
the bootstrap protocol *mandates* capturing a card before a restart whenever
material design input exists.

## Triggering situation

2026-08-31, release preparation for 0.6.0. The session captured a card at 19:45 as
insurance before `docs/state.md` had been committed. Every subsequent full
`verify.mjs` run in the main checkout showed `resume-consumption-check=1` while
the identical tree in two fresh clones showed `resume-consumption-check=0` —
`project/resume-hint.json` is gitignored (`.gitignore:56`), so a clone carries no
live card. That difference is what isolated the cause.

## Why the obvious workarounds are wrong

- **`resume-hint.mjs consume` in the capturing session** writes a receipt claiming
  a session re-grounded on the card when none did. The checker's own text names
  this the F12/F13 regression shape — it is the exact thing the check exists to
  catch, whether an agent or a human at a terminal types it.
- **Weakening or de-registering the check** removes the only mechanical evidence
  that the resume-hint mechanism works at all.
- **The receipt's own contract, read closely, is narrower than the check's framing
  — and that gap is where the ambiguity actually lives.** `resume-hint.mjs`
  documents the receipt's own semantic narrowly, in its comment above
  `CARD_DIGEST_RECORD_SCHEMA`: "A receipt below proves the card's bytes were READ;
  it never proves they were understood or acted on." That is narrower than the
  F12/F13 framing `check-resume-consumption.mjs` uses when it fails, which reads
  as "the agent proceeded as if it had [context] ... unavailable". Read = bytes
  observed; F12/F13-avoided = context genuinely re-grounded. The check can only
  ever test the first. This was hit live on 2026-08-31: a session resumed via
  `--resume` keeps its session id, so a card captured before the restart and
  consumed after it records capture and consumption under ONE session id — and is
  externally indistinguishable from the false case (a receipt written without
  genuine re-grounding), regardless of whether re-grounding genuinely happened.
  The disposition actually taken in that instance was `discard`, not `consume`,
  precisely to avoid manufacturing an indistinguishable-from-false receipt. This
  strengthens proposal 2 below (distinguish "never delivered" from "delivered and
  ignored") — the same-session-id case is a second reason a receipt's mere
  existence cannot stand in for genuine consumption, beyond the never-delivered
  case proposal 2 was written to cover.

The disposition actually taken this session was `resume-hint.mjs discard`, which
is honest ONLY because that particular card's content had already been committed
verbatim into `docs/state.md`, and the card is `nonAuthoritative: true` by its own
schema. That is a property of that one situation, not a general answer.

## Consequence beyond this session

This is the repository's own named defect shape — *a change to A creates an
obligation at B, and only a later gate run reveals it* — reached from the
bootstrap side. A session doing exactly what the bootstrap protocol tells it to do
disables the gate it needs for the release.

It is sharpened by `backlog/items/2026-08-29-claude-code-has-no-mechanical-resume-hint-delivery-hook.md`:
Claude Code has no SessionStart hook that delivers or consumes the card, so even
after a restart the receipt depends on an agent remembering to run `consume` by
hand. A forgotten `consume` leaves the gate red with no indication of why.

## Affected artifact

- `plugins/pipeline-core/scripts/check-resume-consumption.mjs` — the check and its
  `--any-session` mode.
- `harness/scripts/verify.mjs` — where it is registered as
  `resume-consumption-check`.
- `plugins/pipeline-core/scripts/resume-hint.mjs` — `capture` / `consume` /
  `discard`.
- `plugins/pipeline-core/lib/resume-hint.mjs` — the comment above
  `CARD_DIGEST_RECORD_SCHEMA` stating the receipt's own narrower semantic.
- The bootstrap protocol's own restart-hint step, which mandates the capture.

## Proposal

Owner: PO, for assignment. Ordered by cost, and deliberately not pre-deciding.

1. **State the coupling where it is met.** At minimum, `capture` should say that a
   live card reds the verify gate until consumed, and the check's FATAL text
   should name `discard` and `consume` as the two dispositions and which one is
   honest when. Today the failure explains the rule but not the way out.
2. **Then decide whether a freshly captured card should red the gate at all.** A
   card captured in the CURRENT session, never yet offered to any later session,
   has not failed to be consumed — it has not had the chance. A check that cannot
   distinguish "never delivered" from "delivered and ignored" reports the first as
   the second. Binding the card to the session that captured it, and only failing
   once a DIFFERENT session has started without consuming it, would preserve the
   regression this check was built for while removing the false positive. The
   same-session-id resume case above shows this distinction needs care: session id
   alone cannot serve as the "different session" test, since a `--resume` restart
   keeps the same id while genuinely being a new bootstrap.
3. **Do not fix it by exempting the check from `verify.mjs`.** The gate coupling is
   the thing that made this visible at all.
