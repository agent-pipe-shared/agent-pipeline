---
schema: pipeline.backlog-item.v1
id: pipeline.gate-should-not-demand-a-human-name
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
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
