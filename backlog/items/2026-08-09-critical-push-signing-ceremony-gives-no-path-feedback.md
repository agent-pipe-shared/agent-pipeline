---
schema: pipeline.backlog-item.v1
id: pipeline.critical-push-signing-ceremony-gives-no-path-feedback
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
source: "Independent read-only analysis of the PO's private Codex+Pipeline 0.5.4 happy-path re-test (fifth local candidate, final successful session, 2026-08-09), cross-checked against direct code reading of po-human-approval.mjs. Corrects an earlier self-report from inside that same Codex session, which misidentified the failing subcommand."
due: 2026-08-16
---

# The critical-push signing ceremony gives the agent no path feedback, and a guessed subcommand name dead-ends silently

## What happened

In the observed session, the agent invoked `po-human-approval.mjs authorize-critical`
— a subcommand that does not exist on this script (valid subcommands are
`setup|prepare|prepare-critical|approve-critical|verify-critical|...`). It
failed instantly with a generic usage dump. Rather than retry with a valid
subcommand, the agent abandoned the CLI-driven path entirely: it computed the
required subject digest by hand from library internals, then polled an
external directory (`ls`/`date`, several times over ~2 minutes) waiting for a
human operator to drop the three proof files from outside the session. The
push eventually succeeded once those files appeared and `approve-push` was
invoked directly.

Separately, and confirmed by reading `po-human-approval.mjs` directly: none of
its real subcommands (`setup`, `prepare`, `prepare-critical`, `approve`,
`approve-critical`, `verify`, `verify-critical`) print the path(s) of the
file(s) they write (`request`/`authority`/`proof`/`signer` — every write site
is a bare `write(paths.X, ...)` with no accompanying `console.log`). An
operator or agent that needs to hand a generated file to another process
(e.g. copy it to a signing device, or tell a human where to find it) has to
already know the fixed path convention; the tool never states it.

## Why it matters

Two distinct, compounding gaps in the same ceremony: (1) a plausible but
wrong subcommand name gives no "did you mean" hint, so a single guess costs
the entire CLI-driven path rather than one retry; (2) even the correct
subcommands never confirm where they put their output, which is exactly the
kind of thing that forces a human or agent into manual `ls`/`find` polling
instead of reading it off the tool's own success output. This is a genuine
ergonomics gap, independent of the more severe field-count defect filed
separately today
(`2026-08-09-approve-push-rejects-any-fresh-post-setup1-authority-file.md`) —
that item is about a *correct* file being *rejected*; this item is about the
same family of commands never telling you *where* a file it just wrote
actually landed, or what to call instead of a wrong guess.

## Direction

- Have every writing subcommand of `po-human-approval.mjs` print the absolute
  path(s) it just wrote, on success.
- Have the CLI's unknown-subcommand error suggest the closest valid
  subcommand name (or at minimum list them, which the current usage dump
  already does — confirm it is prominent enough that an agent reading it
  would try again rather than pivot away).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, deferred to Sprint Nightwing.
- **Rationale:** matches Nightwing's confirmed scope — "product experience
  ... and low-friction adoption" (`docs/adr/0043-post-go-live-sprint-model.md`,
  2026-08-17 amendment) — this is exactly a CLI-ergonomics/feedback gap
  (path confirmation on write, closest-match subcommand suggestion), not a
  correctness defect and not blocking current work.
- **Assignment (if accepted):** next available Nightwing slot.
- **Date:** 2026-08-17
