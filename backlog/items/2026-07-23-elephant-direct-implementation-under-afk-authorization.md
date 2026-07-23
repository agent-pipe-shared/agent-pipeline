---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-direct-implementation-under-afk-authorization
type: workflow-improvement
owner: pipeline
status: open
created: 2026-07-23
source: close-block ritual step 6b authorship check, native-Windows Verify block (see HISTORY.md 2026-07-23 entry, docs/state.md close-ritual authorship-check incident bullet)
---

# Elephant direct implementation under explicit PO AFK authorization has no defined light process

## Description

A long (6+ hour) session found and fixed ~20 distinct Windows-portability bugs
across 58 files, all implemented directly by the Elephant in the main session
context rather than dispatched to Goldfish subagents, and pushed without an
independent Critic review. This is the exact pattern `docs/operating-model.md`
§2's role table and the CLAUDE.md self-application hard rule (independent
Critic review before the PO gate) are meant to prevent. The PO explicitly and
repeatedly authorized this in the moment ("Freigabe erteilt," going AFK,
pre-authorizing further fix-and-reverify rounds up to push), which is a valid
PO exception for that specific action — but the operating model has no defined
"PO explicitly waives dispatch/Critic-review for this block, here is why" light
path; the only options right now are the full dispatch/Critic ritual or a
silent deviation later caught (if at all) by the close ritual's authorship
check.

## Triggering situation

`docs/state.md`'s 2026-07-23 close-ritual authorship-check incident bullet;
`HISTORY.md`'s 2026-07-23 entry. The PO was asleep/AFK for the entire
implementation and close; there was no opportunity to route work through a
dispatched Goldfish or get a live Critic review before the pre-authorized
push.

## Affected artifact

`docs/operating-model.md` §2 (role table), the close-block skill's step 6b
authorship check, possibly a new short section on PO-waived dispatch for
AFK/time-boxed sessions.

## Proposal

Define an explicit, narrow "PO-waived direct implementation" path: a PO can
pre-authorize the Elephant to implement directly (no Goldfish dispatch) for a
bounded block, but the close ritual should then *require* (not just flag) a
follow-up fresh-context Critic review as the first action of the next session
before the change is considered gate-complete — turning today's silent
authorship-check incident into an explicit, trackable, self-clearing
follow-up item rather than a bullet that can be missed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
