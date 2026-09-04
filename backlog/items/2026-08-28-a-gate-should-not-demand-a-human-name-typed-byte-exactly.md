---
schema: pipeline.backlog-item.v1
id: pipeline.gate-should-not-demand-a-human-name
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-09-04
closure_repository: self
closure_commit: 4f09b2b0023d1e2cfbefa0610992e500e96df666
closure_evidence: "backlog/items/2026-08-28-a-gate-should-not-demand-a-human-name-typed-byte-exactly.md"
sprint: nova-b
tracking: "Nova B — the encoding half is fixed; this is the design half that made the encoding fragile in the first place"
source: "Follow-up from 2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md, consumer incident report S56 finding B1's own second suggestion."
done_when: manual
---

# A confirmation gate should not demand an arbitrary human name typed byte-exactly

## The observation

`po-authority-acknowledge-apply` makes the value of `--by` the token the human must type
back. That value is a person's name: arbitrary Unicode, arbitrary length, and — as the
Windows lockout showed — not reliably reproducible through every terminal's input path.

The encoding defect is fixed. The design question it exposed is not: a confirmation token
exists to prove that an attended human read the summary and deliberately continued. A
name serves that purpose no better than a short generated token, and it drags in every
encoding, normalization and homoglyph question a name can carry (NFC vs NFD alone can make
two visually identical strings unequal, on any platform, with no console involved).

## Direction

Where a gate needs a typed confirmation, print a short ASCII token the human types back,
and keep the name as displayed context rather than as the thing under comparison. The
disclosure still names who is approving; only the compared value changes.

Check every `requireAttendedChatGateConfirmation` caller, not only this one: at least one
already passes a fixed English word, which is the shape to converge on. Whatever is bound
to the approval (commit, digest, plan) stays bound exactly as it is — this changes the
proof-of-attendance token only, never the subject.

## Acceptance criteria

- No gate compares against a value a human supplied as free-form identity text.
- The disclosure still shows the human name, unchanged, so the audit trail is not reduced.
- A test asserts the compared token is ASCII and bounded, independent of any `--by` value.

## Related

- `2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md` — the delivered
  encoding fix; this is the design half it deliberately left open.

## Triage, 2026-09-04 — closed, already resolved in code

Re-verified live (CLAUDE.md's "re-verify an inherited still-open claim" rule)
rather than trusted from the frontmatter `status: open`, which was stale.
Every `requireAttendedChatGateConfirmation` call site was read directly:

- `pipeline-state.mjs`'s `po-authority-acknowledge-apply` — the exact caller
  named in this item's own text — compares against `PO_ACK_APPLY_CONFIRMATION_TOKEN`
  (`"CONFIRM"`), not `apply.by`. Fixed at `4f09b2b0`, tagged `AGY-CF-BL15` in
  the code comment, citing this item by filename. `by` stays fully disclosed
  in `summaryLines`, unchanged. `pipeline-state.test.mjs` line 918 asserts the
  token matches `/^[\x21-\x7E]{1,32}$/u` (short, printable ASCII) and a
  companion test confirms a non-ASCII `--by` value (`"André"`) is still
  accepted for planning while the confirmation gate refuses to compare
  against it.
- `pipeline-state.mjs`'s `approve-push` compares against `pending.code`, a
  generated challenge code — this is the "at least one already passes a
  fixed word" instance the item itself pointed at as the shape to converge
  on.
- `human-guard-override.mjs`'s chat-mode `activate` path compares against a
  derived `` `HGO-${selectionSha256.slice(0, 8).toUpperCase()}` `` token, not
  a name — this path has no `--by` concept at all; the disclosed identity
  information is `reason`, shown unchanged in `summaryLines`.
- `project-onboarding-v3.mjs`'s `kickoffChatGateSpecFor()` gates
  `kickoff-plan`/`kickoff-apply` on `options.language` (bounded `[a-z]{2}`)
  and `kickoff-promote-plan`/`kickoff-promote-apply` on `options.profile`
  (bounded enum) — neither is free-form identity text.

All three acceptance criteria hold across every real call site: no gate
compares a free-form name; every disclosure still shows the human-relevant
context unchanged; and at least the `po-authority-acknowledge-apply` path has
a direct test asserting the compared token is ASCII and bounded, independent
of `--by`. Nothing left to implement — closing rather than dispatching.
