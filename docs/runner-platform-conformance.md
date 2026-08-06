# Runner × platform conformance

> Agent-Pipeline · as of 2026-08-06 · governed by [ADR-0051](adr/0051-dual-runner-tri-platform-development-contract.md)

ADR-0051 defines support precisely:

> "Support" means focused tests exist and pass for the claimed runner/platform
> combination, or a dated, explicit, PO-accepted gap is recorded — an unverified
> claim of support is not support.

This file is that record. It exists because the ADR's own Follow-up asked for gap
tracking and none was ever instantiated: the ADR pointed at backlog items that did
not exist and `docs/state.md` pointed back at the ADR — a closed loop with no owner
(`backlog/items/2026-08-05-adr-0051-follow-up-gaps-untracked.md`). Every cell below
is either **evidenced** with a runnable artifact, or an **accepted gap** with a date
and an owner. There is no third state, and "the suite is green" is not by itself
evidence — see the warning below.

## Matrix

| Runner | Unix / WSL | macOS | Windows (native) |
| --- | --- | --- | --- |
| **Claude Code** | evidenced — see C1 | accepted gap G2 | accepted gap G3 |
| **Codex** | accepted gap G1 | accepted gap G2 | accepted gap G3 |
| **Antigravity (agy)** | out of scope — see A1 | out of scope — see A1 | out of scope — see A1 |

## What green suites do and do not prove

`nova-macos-acceptance-tests` and the Windows-assurance registration pass in every
Verify run, on Unix/WSL, and they are **not** platform evidence. The macOS suite
runs entirely on synthetic fixtures (`hardwareClass: "synthetic"`,
`acceptanceId: "nova-b5-synthetic-01"`): it proves the acceptance-record contract is
enforced, not that anything ran on macOS. Reading those greens as platform support
is exactly the "unverified claim of support" the ADR names.

## Evidenced cells

### C1 — Claude Code × Unix/WSL

- **Method:** fresh session, empty directory, installed candidate plugin (not the
  checkout), consumer path only — `pipeline-start-preflight` → onboarding inspect →
  each returned `nextAction` executed verbatim → guard hook sanity.
- **First run, 2026-08-06:** FAILED. It found the runner-identity defect recorded in
  `backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`
  — a Claude consumer following the tool's own instructions was routed onto the Codex
  rail. This is what the cell is for.
- **Status:** re-run pending after dispatch `RUNNER-THREAD-17`. **This row is not
  evidenced until that re-run is recorded here with its candidate commit.** Do not
  read the table above as settled for C1 before then.

## Accepted gaps

Each gap is accepted by the PO on 2026-08-06 as a deliberate release decision for
0.5.2: the evidence is to be produced against the released artifact rather than
before it, and the PO creates the tracking issues afterwards.

### G1 — Codex × Unix/WSL, not exercised this sprint

- **What is missing:** no Codex-side install was refreshed against this candidate and
  no Codex consumer path was run. The `.codex-plugin/plugin.json` build metadata is
  from 2026-08-03 and has not tracked this sprint's content.
- **Why it is a gap and not a failure:** nothing indicates Codex is broken; it is
  simply unverified against this candidate, which under ADR-0051 is the same thing as
  unsupported until recorded.
- **Accepted by:** PO, 2026-08-06. **To be evidenced against the release.**
- **What would close it:** the C1 procedure, run with the Codex runner and a
  refreshed Codex cachebuster, recorded as a C-row here.

### G2 — macOS, both runners

- **What is missing:** no native macOS execution of Verify or the consumer path. The
  green `nova-macos-acceptance-tests` is fixture-based and does not close this.
- **Constraint:** cannot be produced from the development machine used this sprint
  (Unix/WSL). This is a hard limit, not a scheduling choice.
- **Accepted by:** PO, 2026-08-06. **To be evidenced against the release.**

### G3 — Windows (native), both runners

- **What is missing:** no native-Windows execution. `docs/state.md`'s Cyborg-sprint
  history records a known shell-dependent red set (11 suites red in both Git-Bash and
  PowerShell, 25 red in PowerShell alone), a trusted-tool-resolution gap that makes
  `security-scan` "clean because skipped" rather than "clean because scanned" outside
  an immutable Windows root allowlist, and DACL/durability gaps in
  `afk-ledger` / `advisory-host-bridge` / `codex-isolated-critic-contract`.
- **Note:** this gap is *older and larger* than G1/G2 — it has known red suites, not
  merely absent evidence. ADR-0051 names it explicitly as a starting gap.
- **Constraint:** same as G2.
- **Accepted by:** PO, 2026-08-06. **To be evidenced against the release.**

## Out of scope

### A1 — Antigravity (agy)

ADR-0051 places Antigravity explicitly out of the hard requirement "until it lands",
and its Follow-up states that when it lands the ADR is **revisited and superseded**.
The PO's stated direction (2026-08-06) is an initial demo adapter, after which all
three runners must work on all three platforms — nine cells instead of six.

That is a successor ADR, not an amendment to this file: landing agy changes the
contract, not just the matrix. Not in 0.5.2.

## Maintenance

A cell moves from gap to evidenced only by adding a C-row with a method, a candidate
commit, and a date. A gap with no owner and no date is the failure mode this file was
created to end — do not add one.

**Known weakness of this artifact:** nothing enforces it. It can rot exactly the way
ADR-0051's Follow-up rotted. Turning it into a Verify check — a gate that fails when
a claimed-supported cell has no evidence row, or when an accepted gap passes its
review date — is the obvious next step and is deliberately not in 0.5.2.
