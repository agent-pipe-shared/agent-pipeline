---
schema: pipeline.backlog-item.v1
id: pipeline.critical-push-signing-ceremony-gives-no-path-feedback
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-09
closed_at: 2026-08-19
closure_repository: self
closure_commit: 9ae28dad3f6c9c41833e7d629fa3d1d73872d2a2
closure_evidence: backlog/items/2026-08-09-critical-push-signing-ceremony-gives-no-path-feedback.md
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

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

plugins/pipeline-core/scripts/po-human-approval.mjs now implements both of the item's Direction bullets, tagged NVA-CLI-FEEDBACK-1 with an explicit comment citing this exact backlog item's filename (line 352-353). (1) Path feedback: every writing subcommand's returned result object now carries a 'paths' field naming what it wrote (e.g. lines 1001, 1008, 1013, 1141), and the full result including 'paths' is printed to stdout via process.stdout.write(JSON.stringify(runHumanApproval(),...)) at line 1160 — so a caller sees the written path(s) on success rather than having to guess/poll. (2) Closest-match subcommand suggestion: KNOWN_COMMANDS (line 357) plus a Levenshtein-distance suggestSubcommand() (lines 359-422) render 'Unknown subcommand "X". Did you mean "Y"?' for an unrecognized subcommand, bounded by SUBCOMMAND_SUGGESTION_MAX_DISTANCE so it never guesses wildly — this directly covers the item's own worked example (a guessed 'authorize-critical' would now get a concrete suggestion instead of only a bare usage dump). Frontmatter/Triage still literally says status: open / deferred to Sprint Nightwing, but that status text is stale relative to the actual current code.
