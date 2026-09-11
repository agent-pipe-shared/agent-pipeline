# Runner and platform conformance

> Agent-Pipeline · as of 2026-08-06 · governed by
> [ADR-0051](adr/0051-dual-runner-tri-platform-development-contract.md) as clarified by
> [ADR-0057](adr/0057-runner-platform-support-is-an-implementation-obligation.md)

## The claim

Agent-Pipeline's portable methodology and declared Claude Code and Codex
integration surfaces support **Windows, macOS and Unix/WSL**. The claim applies
per surface: shared contracts rely on runner, shell and filesystem neutrality;
host-native capabilities additionally require the platform and evidence named
by their own contract.

The development machine does not qualify the portable claim. A release is
always built on one machine, and ADR-0057 rejects a mandatory manual matrix for
the shared surfaces. This does not turn evidence from one host into proof of a
different host-native capability. In particular, native Codex sandbox/App-
Server execution is deactivated on WSL and deferred to a native-Windows package;
WSL diagnostics establish no readiness claim for that route.

## What actually carries the claim

Not a matrix somebody fills in. **Properties of the code**, which hold for every
change on whatever machine is at hand.

### R1 — Runner neutrality by construction

Every shared surface must work under both runners: genuinely runner-neutral, or
explicitly routed per runner. A runner-specific capability states and tests its
own supported surface; it does not silently widen the shared claim.

**Never a silent single-runner default.** No literal fallback runner, no environment
sniff standing in for a threaded identity. This is the strongest clause in ADR-0051
and the defect class it was written for:

- `7f5ac97` — preflight never told the onboarding script which runner was
  bootstrapping; every session silently defaulted to `codex` and inherited a
  Codex-only App-Server requirement it could not satisfy.
- F-A, this sprint — an environment variable serving as runner authority in the
  shared admission gate.
- `RUNNER-THREAD-17`, in flight — eight literal `runner = "codex"` defaults in the V4
  onboarding lifecycle, plus a CLI that parsed `--runner` and discarded it. Found by a
  consumer smoke test, not by a matrix.

Each of these was a *code* defect, found by exercising code — which is the argument
for R1 over per-cell evidence.

### R2 — Shell portability by construction

Every portable script, invocation and human-copyable command works under
PowerShell **and** an ordinary POSIX shell. A host-native command may be scoped
to its declared platform; a portable command rendered for one shell family
only is a defect.

Reference shape: `restartCopyCommands` in
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, which renders a POSIX and a
PowerShell form of the same bounded action, with the argv shape validated before
either is emitted.

### R3 — Path and filesystem neutrality

Shared code makes no assumption of a path separator, case-folding rule, or
permission model that holds on only one platform. Platform adapters own and
test their explicit differences. Windows private-state handling
(`windows-private-state.mjs`, DACL assurance) is the reference shape for the
permission side.

## Enforcement status, stated honestly

R1–R3 are the obligation. Most of them are **not yet mechanically enforced**, which
means they currently rest on review — weaker than a check, and worth saying plainly
rather than implying a rigour that is not there.

| Property | Enforced how, today |
| --- | --- |
| No literal runner default in gate-critical paths | review only — a check is the highest-value thing to build next |
| Runner identity threaded through the onboarding lifecycle | in progress (`RUNNER-THREAD-17`); a consumer-chain regression test is part of it |
| Human-copyable commands carry both shell renderings | implemented for the restart action; no general check |
| Verify suites runnable under both shell families | partially — see the known defect class below |

## Known defect class, unchanged

Native Windows carries a real red set from the Cyborg sprint, recorded in
`docs/state.md`: 11 suites red under both Git-Bash and PowerShell, 25 under PowerShell
alone; a trusted-tool-resolution gap that makes `security-scan` "clean because
skipped" rather than "clean because scanned" outside an immutable Windows root
allowlist; and DACL/durability gaps in `afk-ledger` / `advisory-host-bridge` /
`codex-isolated-critic-contract`.

This is a **defect class, not a missing-evidence gap**. Reclassifying evidence duty
does not make known-red suites green, and ADR-0057 explicitly retains it.

Native Codex sandbox/App-Server acceptance is a separate host-native surface.
It is deactivated on WSL and tracked for a future native-Windows package in the
existing `sprint: none` items linked from
[`runtime-boundary.md`](runtime-boundary.md). Historical WSL probes remain useful
diagnostics, but cannot establish that surface's readiness.

## Optional evidence log

The PO performs manual runner/platform verification independently and in parallel with
development, and creates issues from what it finds. This is **valuable and
non-mandatory**: it gates nothing, its absence retracts nothing, and a finding from it
is an ordinary defect.

Runs may be recorded here when they happen. An empty section means nobody has recorded
one recently — it does not mean anything is unsupported.

| Date | Runner | Platform | Candidate | Outcome |
| --- | --- | --- | --- | --- |
| 2026-08-06 | Claude Code | Unix/WSL | `cc91243` | Consumer smoke test in an empty directory found the `RUNNER-THREAD-17` runner-identity defect; re-run pending after the fix. |

## What this file is not

It is not a gate, and it must not become one: gating on manual work the PO has
designated optional would fail on whichever machine is not currently in front of the
developer. What *should* become gates are the R1/R2 checks in the enforcement table —
those run anywhere.
