---
schema: pipeline.backlog-item.v1
id: pipeline.three-smaller-greenfield-defects
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Greenfield onboarding handover from a parallel Claude session, 2026-08-08, findings 9, 11 and 12 of 12. Grouped because each is small and self-contained; none needs a design round of its own."
---

# Three smaller defects from the same greenfield run

Grouped deliberately. Each is narrow, independently fixable, and would not
justify its own item — but all three were hit in a single first-run onboarding,
which is the observation worth keeping: they are what the first hour with this
Pipeline actually feels like.

## 1. The Resume-Hint sanitizer rejects ordinary prose

`SENSITIVE_OR_CONTROLLED_TEXT` forbids, among other characters, `:` and `/`. A
card describing *"Level 2: …"* cannot be stored. The operator's workaround is to
rewrite the sentence around the regex rather than around its meaning.

The sanitizer exists for a good reason — the card must never carry credentials,
host paths, URLs or transcripts. But a colon is not a secret, and a rule that
catches punctuation catches the content it was meant to preserve. The filter is
matching on characters that *appear in* the dangerous forms rather than on the
forms themselves.

**Direction, not a design:** match the shapes that are actually forbidden
(scheme-qualified URLs, absolute paths, key-like tokens) rather than their
constituent characters. Whatever replaces it needs cases for both sides: a plain
sentence containing a colon is storable, and a URL or absolute path still is not.

## 2. Two subsystems disagree about whether setup is complete

The SessionStart hook reported *"Setup not complete — pipeline.user.yaml is still
missing"* while `pipeline-start-preflight` simultaneously returned `ready`, and
the authority seed then wrote that very file moments later.

All three can be individually correct about the instant they looked. That is the
defect: three components observing one lifecycle at three moments and reporting
contradictory conclusions to the same human, with nothing reconciling them. The
operator cannot tell which one to believe, and on a first run has no basis to
guess.

**Direction:** either the hook reads the same readiness projection the preflight
does, or it says explicitly that its view is a point-in-time snapshot that
onboarding is expected to change. Two authorities reporting one fact is the
thing to remove.

## 3. Provisional kickoff artifacts are never cleaned up

`specs/kickoff-<id>/` survives promotion, still containing a PRD and a Spec that
look authoritative and are not. Nothing removes them, nothing marks them
superseded, and nothing points at the real package that replaced them.

The promotion flow's own documentation calls these "provisional bootstrap
anchors". After promotion they are stale copies of the two documents the whole
gate chain is digest-bound to — the exact material a later session, or a fresh
context, would most easily mistake for authority.

**Direction:** the promotion transaction knows both locations, so it is the place
that can retire the provisional one — by removal, or by a marker naming its
successor. A cleanup that runs outside the transaction risks removing anchors a
failed promotion still needs.

## Triggering situation

Greenfield onboarding of a `feature`-profile project with the Claude runner,
2026-08-07/08, against the local `0.5.3+claude.20260807221336.14e7b97` build.
**None of the three is independently reproduced in this repository.**

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
