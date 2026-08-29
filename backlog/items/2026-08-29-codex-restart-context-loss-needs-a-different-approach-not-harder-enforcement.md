---
schema: pipeline.backlog-item.v1
id: pipeline.codex-restart-context-loss-needs-a-different-approach
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- PO explicitly elevated this 2026-08-29, live: 'was echt ein riesen thema ist, sind die fehlenden codex übergaben. Da braucht es eine ganz andere idee mal als ansatz bzw. härtere durchsetzung mit dem hint - das kann codex so einfach nie sauber verarbeiten' (this is a genuinely huge topic; needs a completely different approach, or harder enforcement -- Codex apparently can never cleanly process the current mechanism this simply)."
source: "PO inline observation #2 (2026-08-29 greenfield synthesis: 'Codex STILL (5 fix rounds over 3 weeks!) doesn't carry inputs/data across a restart'); Codex 060-77 retrospective section 'Informationsverlust beim Wiederanlauf'; supersedes 2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md and 2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md (both closed, both via code-reading/unit-test verification only -- neither live-verified against a real Codex restart, per this session's own now-repeated 'closed via code-reading, still broken live' failure pattern)."
---

# Codex restart context loss: closed twice on code evidence, still reported broken live after 5 fix rounds over 3 weeks -- needs a different approach, not another wiring pass

## What happened

Two backlog items already targeted this exact symptom class and were both
closed on code/test evidence:

- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  (closed 2026-08-19) -- an instruction hook telling Codex to read its own
  prior transcript, wired and unit-tested.
- `2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md`
  (closed same day) -- the `resume-hint.mjs` `materialInput` mechanism
  (verbatim design-input capture across restarts), confirmed by static
  reading to exist and be runner-neutral.

The PO's own count: **5 fix rounds over 3 weeks**, and the problem is STILL
live -- reconfirmed by the Codex 060-77 greenfield retrospective the same
day these items were (re-)closed: "Der Resume-Hinweis war gegenüber dem
früheren Designinput deutlich verdichtet. Dadurch wurden zunächst generische
Zusatzfragen gestellt, obwohl die detaillierten Anforderungen bereits im
Gesprächskontext vorhanden waren." A prior investigation this session found
`resume-hint.mjs` grepped for "codex"/"Codex" with NO hits -- the mechanism
is generic/runner-neutral, which means either the Codex bootstrap path never
actually calls `resume-hint.mjs capture`/`inspect` at all, or it does and
the consumption step (reading `materialInput` back at the START of the next
session, per this repo's own MUST-DO consumption duty) is not actually
happening in the Codex adapter's own restart flow.

## Why this needs a different approach, per the PO's own explicit framing

The PO's instruction is explicit: **not** "harden the existing wiring
again" as the default next move -- five rounds of exactly that have not
held. The PO asks for either (a) a genuinely different mechanism, or (b) a
much harder technical enforcement with a strong hint, given their own
assessment that "Codex kann das so einfach nie sauber verarbeiten"
(Codex can apparently never cleanly process this the simple way). Read as
a request to question the mechanism's fit for Codex specifically, not just
its implementation.

## Direction (not prescriptive -- the PO wants a real design pass, not a patch)

1. Before proposing anything: get a genuine Codex-side root cause. Does the
   Codex bootstrap/session-restart path actually invoke `resume-hint.mjs`
   at all? If yes, at what turn, and does the MUST-DO consumption step
   (reading `materialInput` back and incorporating it before the bootstrap
   confirmation line) actually run, or is it silently skipped/failing?
2. Consider whether Codex's own session/restart model (distinct from Claude
   Code's) structurally cannot rely on the SAME mechanism Claude Code uses
   -- e.g. if Codex's restart genuinely starts from a smaller/different
   context envelope than Claude Code's, a Claude-shaped fix may be the
   wrong shape entirely for this runner.
3. "Härtere Durchsetzung" (harder enforcement) as an explicit alternative:
   rather than relying on the agent to read and apply a resume hint, could
   the harness/driver ITSELF refuse to proceed past the first design
   question until it has mechanically confirmed the prior material input
   was read (not just present) -- shifting from "the agent should read this"
   to "the session cannot advance without proving it did"?

## Acceptance criteria

- A live reproduction against a real Codex restart (not code-reading)
  confirms whether the mechanism fires at all for this runner.
- Whatever direction is chosen, it is proven against that live reproduction,
  not against unit tests alone -- this item's own history is the argument
  for why unit-test-only verification is not sufficient here.
- The fix, once verified, becomes permanent regression coverage exercising
  the ACTUAL Codex restart path, not a generic runner-neutral stand-in.

## Triage

- **Decision:** accepted, Nova A, PO-elevated priority ("riesen Thema")
- **Rationale:** live, explicit PO escalation 2026-08-29; 4th recurrence this
  session of the "closed via code-reading, still broken live" pattern.
- **Date:** 2026-08-29

## Related

- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  (closed) -- first attempt, superseded.
- `2026-08-29-mechanical-proof-of-complete-prior-input-consumption-across-restart.md`
  (closed) -- second attempt, superseded.
- `2026-08-29-codex-worker-subagent-dispatch-capability-is-broken.md` (open,
  Nova B) -- a second, separate Codex-runner-specific structural gap found
  the same session; may share a root cause worth investigating together
  (both are "Codex's own session/runtime model behaves differently than
  assumed").
