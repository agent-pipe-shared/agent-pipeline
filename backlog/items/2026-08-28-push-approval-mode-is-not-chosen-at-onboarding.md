---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-mode-is-not-chosen-at-onboarding
type: requirement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: the push approval is the last step of the path the PO named"
source: "Agy/WSL greenfield run, 2026-08-28, its own hardening self-analysis (pipeline-analysis.md), corroborated by the Codex/WSL run's independent script-indirection probe."
---

# The push-approval mode defaults to maximum friction without ever asking

## What happened

`gates.push_approval` seeds to `signature` (`machinePushApprovalPreference(fs) ??
"signature"`). Agy's report: this "plunges the user into a complex cryptographic
workflow requiring external Ed25519 keys, manual script executions, and
copy-pasting JSON request objects" — for a trivial greenfield project, never
having been asked whether that was wanted.

The PO's own observation is sharper and more worrying: **agents keep trying to
avoid the signature rather than request it.** Agy attempted to bypass it, and it
is unclear whether it genuinely switched to `chat` or only believed it had.

## Why the default itself is right

Failing closed to `signature` is correct — ADR-0056 makes anything unreadable or
unrecognised resolve to `signature`, and that must stay. A weaker default would
silently downgrade projects that need the strong mode.

The defect is that the choice is never *offered*. A default is not a decision,
and a human who was never asked cannot be said to have chosen maximum friction.

## Direction

- Ask during init, as one of the small set of genuinely human questions, with the
  consequence of each mode stated in one line.
- Keep `signature` as the fail-closed default for anything unanswered or
  unreadable.
- Make the *active* mode visible in the bootstrap confirmation, so a runner that
  believes it switched modes can be contradicted by the record.

## Acceptance criteria

- Init asks once and records the answer.
- An unanswered or malformed value still resolves to `signature`.
- The active mode is printed at every bootstrap, so a mistaken belief about it is
  immediately falsifiable.
