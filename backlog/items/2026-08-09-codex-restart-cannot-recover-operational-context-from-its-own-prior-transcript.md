---
schema: pipeline.backlog-item.v1
id: pipeline.codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript
type: idea
owner: pipeline
status: open
created: 2026-08-09
source: "PO observation of a live Codex greenfield test session, 2026-08-09 (three rollout files, two restarts), plus independent forensic confirmation that the sanitized resume-hint card cannot carry this class of information by design."
due: 2026-08-23
---

# Should a Codex restart be told to consult its own prior rollout transcript, not only the sanitized resume-hint card?

## What happened

Across two restarts in one Codex test session, the agent lost all
operational context each time: already-hit guard errors, established
workarounds, and the exact state of in-progress work all had to be
rediscovered from scratch. The PO's suggestion: on restart, tell the agent to
run `pipeline-start` AND read the previous session's own JSONL transcript
file, if one can be located, as a richer recovery source than the
resume-hint card alone.

Independently confirmed this session: even a WORKING resume-hint capture
(see the sibling defect about `apply_patch` never being recognized as a
write tool during `restart-required`) is deliberately barred from carrying
"raw transcripts, commands, approvals, lifecycle instructions" — by design,
per `pipeline-start/SKILL.md`'s own resume-hint rules. So even a fully
functioning resume-hint mechanism was never going to solve the specific loss
the PO observed (rediscovering guard workarounds, in-progress diagnostic
state) — that class of information is explicitly out of the card's scope,
not an implementation gap in it.

## Why this needs a real design pass, not a quick fix

- Codex's own rollout files live at a host/tool-specific path
  (`~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`) with no
  obviously reliable, portable way for a *new* session to identify which
  prior rollout file is "the one to read" — multiple sessions can run the
  same day, across different projects, and the new session has no session ID
  for its predecessor unless something explicitly hands it one.
  - However: `Codex 0.145` writes its own `session_meta`/thread linkage,
    and the CLI itself is invoked by an external harness that DOES know the
    prior session's ID when initiating a restart — plausibly the restart
    ACTION ITSELF (not the agent's own guesswork) could pass the prior
    rollout path down explicitly, side-stepping the discovery problem
    entirely. This would need investigation into whatever code path
    triggers a Codex restart today.
- Reading a full raw transcript back in is exactly the kind of unbounded,
  potentially-large, unsanitized input the resume-hint mechanism was
  deliberately designed to AVOID (privacy, payload-budget, and "never a raw
  transcript" are explicit, stated design constraints elsewhere in this
  codebase) — a blanket "read your own last transcript" recommendation could
  reintroduce exactly the risk class the sanitized-card design exists to
  prevent, unless carefully bounded (e.g. read only the last N tool
  results/errors, never full user-turn content).
- This is Codex-specific; Claude Code's own session/transcript model and
  restart semantics differ, so any fix here should not assume it transfers.

## Direction (for a future dedicated design pass, not a same-night fix)

Investigate whether the mechanism that INITIATES a Codex restart already
knows (or could be made to know) the prior rollout file's path, and if so,
whether passing it down explicitly (rather than having the new session guess
at discovery) is both feasible and safe. If a bounded, privacy-respecting
subset of "what to recover" can be defined (e.g. only recently-hit guard
denial codes and their resolutions, not full transcript content), scope a
proper spec for it rather than a quick patch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Deferred, not declined — PO wants to test tonight's
  `apply_patch` resume-hint-capture fix (GF-078, commit `92c4ee71`) in a real
  Codex restart first, before deciding whether this item's larger
  transcript-reading idea is still needed on top of it.
- **Rationale:** PO's own words, 2026-08-10: "ich teste erst mal den Fix von
  heute" — the narrower fix already landed tonight may reduce or eliminate
  the practical impact of the context-loss this item describes; investing in
  the larger, harder design (bounded prior-transcript recovery) before that
  evidence exists would risk building for a problem that's already smaller
  than measured.
- **Assignment:** n/a — revisit after the PO's next live Codex test.
- **Date:** 2026-08-10

### Re-triaged after the live retest (PO, 2026-08-12) — still broken, concrete design steer given

- **Decision:** The PO retested and the loss-of-operational-context problem
  is **still present** ("leider immer noch fehlerhaft") — the narrower
  GF-078 resume-hint-capture fix alone did not resolve it. No longer
  deferred; accepted with a concrete design direction from the PO:
  1. **The resume-hint WRITE side needs to be more comprehensive.** The
     current capture is too narrow to carry what a restart actually needs.
  2. **The READ side is the part most often forgotten entirely** — a
     working card is not enough if nothing reliably consumes it.
     Reading the prior session's own transcript must become **mandatory**,
     not best-effort, triggered at one of two points: the first
     successful bootstrap after a restart, or the first time the session
     reaches a `ready` state — whichever this item's implementation finds
     the more reliable hook.
- **Rationale:** PO, 2026-08-12, verbatim: "leider immer noch fehlerhaft -
  design write muss umfassender sein und read wird oft vergessen muss
  pflicht bei erstem erfolgreichem bootstrap werden oder bei erstem ready
  werden transskript der vor session lesen."
- **Assignment:** real design + implementation work, queued for this
  session. Must still respect this item's own earlier-recorded constraints
  (Codex rollout files live at a host/tool-specific path; the new-session
  cannot trivially identify which prior rollout file is "the one" unless
  the restart action itself passes it down; reading a full raw transcript
  conflicts with the resume-hint mechanism's deliberate
  privacy/payload-budget design — so "read the prior transcript" should be
  bounded, e.g. recently-hit guard denials and their resolutions, not
  unbounded raw content).
- **Date:** 2026-08-12

### Re-triaged 2026-08-17 — the queued work was never actually implemented

- **Decision:** accepted, stays open, current scope (not deferred). A
  repo-wide search for any mandatory-transcript-read mechanism (bootstrap or
  first-ready hook reading a prior Codex rollout file) found nothing —
  neither the "write side more comprehensive" nor the "read becomes
  mandatory at first bootstrap/ready" direction from the 2026-08-12
  re-triage has landed. The "queued for this session" assignment from
  2026-08-12 did not execute.
- **Rationale:** correcting the record rather than leaving a stale
  "queued" status that implies work in flight. The PO's own retest found
  this still broken as of 2026-08-12; nothing since changes that.
- **Assignment (if accepted):** unassigned, needs a real design +
  implementation dispatch respecting the constraints already recorded
  above — genuinely current work, not later-sprint scope, given the PO's
  explicit "still broken" signal.
- **Date:** 2026-08-17

### Re-triaged 2026-08-17 (second occurrence, same day) — PO reconfirms via a fresh Codex happy-path restart, explicitly scoped to 0.6.0

- **Decision:** accepted, current scope, explicitly targeted for the 0.6.0
  release — not blocking any in-flight candidate. The PO restarted the
  happy-path test and observed the exact same write-side gap this item
  already describes ("codex schreibt immer noch nur kleine teile des inputs
  vor dem neustart in die kachel und verliert damit wichtige infos für den
  happy patch"), and restated the 2026-08-12 read-side direction in the same
  words as a hard requirement going forward: for this class of initial
  onboarding restart, the resume-hint card must carry a mandatory entry
  instructing the new session to read the prior session's own JSON
  transcript, since the parameters a restart needs (language, etc.) are
  already resolved there.
- **Rationale:** PO, 2026-08-17, verbatim: "für diese art initialer neustart
  kommt ab jetzt verpflichtend ein eintrag in diese hint kachel, dass die
  neue session zwingend das json transkript der alten auslesen soll. Dort
  sind auch dann immer die notwendigen parameter wie sprache etc schon
  definiert... Das bitte auch noch aufnehmen (nicht blocking aber kommt in
  den 0.6.0 mit rein)." This is the same design direction as the 2026-08-12
  re-triage, now explicitly release-scoped rather than open-ended.
- **Assignment:** still needs the real design pass the 2026-08-12 re-triage
  already scoped (constraints unchanged: host/tool-specific rollout path,
  no reliable predecessor-session identification unless the restart action
  passes it down, bounded not raw-transcript reading) — queue for a
  dedicated design+implementation session before 0.6.0 ships, not same-day
  with the two narrower live-test findings from today (git-identity set
  timing, signing-ceremony disclosures).
- **Date:** 2026-08-17

### Reconfirmed in the 0.6.0 release backlog sweep, 2026-08-18

- **Decision:** no re-decision needed — the 2026-08-17 re-triage already
  records a real, specific, PO-confirmed decision explicitly scoped to
  0.6.0 (mandatory resume-hint entry directing a restart to read the prior
  session's own JSON transcript; write-side comprehensiveness gap also
  named) with a concrete, bounded assignment (a dedicated design +
  implementation dispatch). That work has not yet been dispatched.
- **Rationale:** this is real work touching the resume-hint mechanism and
  Codex restart flow — needs a design pass and Verify to trust, not a
  same-pass fix; this read-only triage sweep is not the place to attempt
  it.
- **Assignment:** unchanged — unassigned, queued for a dedicated
  design+implementation dispatch before 0.6.0 ships, per the constraints
  the 2026-08-12/2026-08-17 re-triages already recorded.
- **Date:** 2026-08-18
