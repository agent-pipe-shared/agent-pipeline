---
schema: pipeline.backlog-item.v1
id: pipeline.signing-ceremony-tty-check-has-no-windows-fallback
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- surfaced 2026-08-30 while cross-checking the Claude/Windows greenfield retrospective against current code; confirmed still present, unfixed."
source: "Claude-060-78 greenfield retrospective, section 8, tool defect 3; verified live against plugins/pipeline-core/scripts/po-human-approval.mjs:964 on 2026-08-30."
---

# The attended-terminal check in the signing ceremony requires `/dev/tty`, with no Windows fallback

## What happened

`plugins/pipeline-core/scripts/po-human-approval.mjs` line 964:

    openControllingTty = dependencies.openControllingTty ?? (() => openSync("/dev/tty", "r+"))

The attended-terminal requirement for `sign-intent`/`approve-critical`
(this repo's `pipeline.signing-requires-attended-terminal` rule -- see
docs/push-release-flow.md) opens `/dev/tty` unconditionally. There is no
`process.platform === "win32"` branch and no Windows console-handle
alternative (e.g. `\\.\CONIN$`). On native Windows (not WSL), this call
fails, meaning the PO cannot complete a signing ceremony from a native
Windows terminal at all -- only from WSL/Linux/macOS.

This repository's canonical PO signing key currently lives on the Windows
side (OneDrive) but is signed FROM inside WSL via the WSL-side script path
-- so this gap has not blocked the PO so far, but it does block a native
Windows terminal from ever completing this ceremony directly.

## Proposal

Add a Windows branch to the controlling-terminal open: detect
`process.platform === "win32"` and open the Windows console input handle
(`\\.\CONIN$`) instead of `/dev/tty`, preserving the same attended-terminal
guarantee.

## Acceptance criteria

- `sign-intent`/`approve-critical` can complete from a native Windows
  terminal (cmd.exe or PowerShell), not only WSL/Linux/macOS.
- The non-Windows path is unchanged.
- A platform-appropriate test or manual verification note covers the
  Windows branch (native Windows execution may not be testable from this
  WSL session -- note that limitation honestly rather than fabricating
  coverage).

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30 alongside 3 sibling findings from
  the same retrospective cross-check; not currently blocking (PO signs via
  WSL), but a real gap for native-Windows use
- **Date:** 2026-08-30
