<!-- po-language: en -->

# Sentinel Platform Support Contract

**Status:** binding Sentinel authority, 2026-07-22. This contract defines when
a named capability may be described as supported on Windows, Linux, WSL, or
macOS. It closes no backlog item, replaces no platform-specific AC matrix, and
does not extend runtime authority.

<!-- windows-blockers-scope-sha256: 0752415e7916b4db41b8c257339953a31924c68392d644e6c7b07993e08ecca0 -->

The bound input is the adjacent
[`windows-blockers-scope.md`](windows-blockers-scope.md). Its five-record
Windows track records `#33` as canonically closed and `#34`–`#37` as open. The
PRD binds this contract, forming the byte-exact chain **PRD → Platform Support
Contract → Windows Blocker Scope**. A changed input invalidates every derived
platform or go-live claim until the chain and its evidence are reviewed again.

## Scope and definitions

A **capability** is a narrowly named product path with its version,
configuration, permissions, filesystem class, and security boundary, such as
native Full Verify, directory durability, or private-state assurance. A bare
statement that a platform is “supported” is not a valid product claim.

The target classes are **Windows**, **Linux**, **WSL**, and **macOS**. WSL is
always distinct: at least `wsl-native` and `wsl-drvfs` are separate from each
other, Windows, and Linux. Evidence for one variant never silently transfers to
another.

**Native same-surface evidence** is evidence on the same target class and
surface for which the capability is claimed: the same product candidate,
operating system and filesystem, standard-account privilege mode, runner/host,
and relevant tool or sandbox configuration. A mock, emulator, cross-compile,
or different host can explain a test case but cannot attest native support.

Docker is currently **out of scope**. A container result may describe a
container capability as diagnostic-only, but never replaces native same-surface
evidence for Windows, Linux, WSL, or macOS. In particular, a Linux container
does not attest host filesystem, DACL, cgroup, sandbox, or standard-account
properties for another target class.

## Capability statuses

| Status | Meaning |
| --- | --- |
| `supported` | Every criterion in this contract is satisfied for the named surface and current candidate. |
| `conditionally-supported` | Supported only with the explicitly recorded prerequisites. |
| `diagnostic-only` | Observation or fixture exists, but no support commitment exists. |
| `blocked` | A named open dependency or AC prevents the commitment. |
| `unavailable` | The capability or required proof is unavailable on that surface; fail closed. |
| `unsupported` | The capability is outside approved product scope. |
| `ambiguous` | Platform, filesystem, or host boundary was not observed sufficiently; fail closed. |

`blocked`, `unavailable`, `unsupported`, and `ambiguous` are typed negative
outcomes. A fallback, best-effort run, or another platform result must not
reinterpret them as `supported` or `conditionally-supported`.

## Honest baseline

The four target classes are in scope for support and evidence; this does **not**
claim that every current capability is supported on every class.

| Target class | Current permitted statement |
| --- | --- |
| Windows | `#33` is canonically closed; `#34`–`#37` remain open. No `supported` claim follows for capabilities affected by those open records. |
| Linux | Existing controls may be `conditionally-supported` only per capability and its stated prerequisites. |
| WSL | The current Codex WSL2 host is an available `wsl-native` evidence surface; every candidate still needs its own native evidence. `wsl-drvfs` remains `ambiguous` until separately observed. |
| macOS | A capability without native proof is `unavailable`; a mocked path is not native support. The PO exception below may close Sentinel scope but never creates a support claim. |

## Evidence and closure criteria

A `supported` or `conditionally-supported` record for one current candidate and
one capability surface must jointly provide:

1. native same-surface evidence for positive and relevant negative/fail-closed
   cases;
2. focused registered tests and a successful `node harness/scripts/verify.mjs`
   whose machine evidence binds that candidate;
3. current Security evidence for that candidate; missing, skipped, red, or
   unbound evidence is `security-evidence-unavailable`, not support;
4. a fresh independent Critic for the platform/security-relevant diff. Where
   native Critic isolation is unavailable, only the existing PO-authorized
   `functional-equivalent-read-only; OS isolation not asserted` assurance is
   admissible, and it does not attest native platform or isolation evidence;
5. the corresponding AC matrix, open prerequisites, and required Human/PO
   gates. An open blocker remains `blocked`.

Evidence is not portable between target classes. A missing class is visible as
a typed negative status, never silently covered by another host.

## PO exception for unavailable macOS evidence

The PO accepted on 2026-07-22 that unavailable native macOS evidence does not
block the Sentinel-close disposition. The exception is limited to macOS, the
current Sentinel scope, and the absence of a native host; it does not satisfy
any `supported` or `conditionally-supported` criterion, change the `unavailable`
status, waive a Windows/Linux/WSL requirement, or authorize a release claim.
The PO owns the exception. It must be reviewed by 2026-08-31 or explicitly
extended by the PO; a newly available native macOS host ends the evidence
exception for subsequent candidates.

## Change and migration rule

Platform capability, status, filesystem, tool-trust, or security-boundary
changes update this contract and the relevant AC matrix first, recompute bound
SHA-256 values, and repeat Verify, Security, and Critic on the new candidate.
Docker evidence never substitutes for that order.

The retention authority therefore uses `pipeline.spec-retention.v2` and its
archive counterpart to bind this contract and the Windows scope. The checker
continues to accept the complete former `v1` five-authority shape; v1 consumers
can migrate by adding `platformSupport` and `windowsBlockers` before selecting
v2. No v1 record is reinterpreted or mutated by the checker.
