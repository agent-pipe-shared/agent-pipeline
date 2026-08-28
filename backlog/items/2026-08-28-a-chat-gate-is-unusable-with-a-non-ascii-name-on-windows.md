---
schema: pipeline.backlog-item.v1
id: pipeline.chat-gate-non-ascii-name-windows
type: defect
owner: pipeline
status: closed
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — delivered 2026-08-28, same session it was reported"
source: "Consumer project HA, incident report S56 finding B1 (2026-08-28, Windows, PowerShell). Reproduced from the reported bytes in a test before fixing."
closed_at: "2026-08-28"
closure_repository: "self"
closure_commit: "e2b357117f32e3229587b50b4a7fa715b5499f0e"
closure_evidence: "plugins/pipeline-core/lib/chat-gate-ceremony.test.mjs"
---

# A chat-mode gate was unusable for a PO whose name is not pure ASCII, on Windows

## What was measured

`readAttendedLine()` (`lib/chat-gate-ceremony.mjs`) read the confirmation byte by byte via
`readSync(0, ...)` and decoded the result hard as UTF-8. A Windows console on a legacy
Western code page (cp1252/cp850, still the default in many PowerShell and cmd.exe windows)
sends a typed `é` as the single byte `0xE9`, not `0xC3 0xA9`. Decoded as UTF-8 that is
invalid and becomes U+FFFD, so the comparison against `--by "André"` could never succeed.

The prompt rendered the name correctly — output worked, only the return channel did not.
Four variants were tried and all refused; `--by "Andre"` passed immediately. The same
primitive backs `approve-push`, the kickoff language gate, the PO plan acknowledgement and
the human-guard override, so the lockout was total for an affected PO on that platform.

## What was delivered

`decodeTypedLine()` decodes strictly as UTF-8 and, only when the bytes are not valid UTF-8
— a deterministic property of the bytes, not a retry — reads them as latin1, which is the
correct reading of that console's high bytes for every accented letter (cp1252 and latin1
agree across 0xC0–0xFF). `po-human-approval.mjs`'s own reader, which carried the identical
line and a comment claiming the two mirror each other, now imports the shared decoder
instead of keeping a copy that could drift.

No security boundary moved: the proof of a live human is `isAttendedTerminal()`, a real
TTY on fd 0, and a test asserts the non-TTY path still refuses before a single byte is
read.

## Deliberately not addressed here

That an arbitrary human name is the value a gate demands typed back byte-exactly at all.
Filed as `2026-08-28-a-gate-should-not-demand-a-human-name-typed-byte-exactly.md`.

## Related

- `2026-08-28-a-po-ceremony-in-the-po-s-own-terminal-resolves-the-wrong-runner.md` — what
  the PO meets once this gate lets them into their own terminal.
