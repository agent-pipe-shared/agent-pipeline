# ADR-0057: runner/platform support is an implementation obligation, not a per-cell evidence duty

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted · **Basis:** PO clarification, 2026-08-06 · **Clarifies and
partially supersedes** [ADR-0051](0051-dual-runner-tri-platform-development-contract.md)'s
"support" clause. Everything else in ADR-0051 stands unchanged.

## Context

ADR-0051 closes with a definition that reads, taken literally:

> "Support" means focused tests exist and pass for the claimed runner/platform
> combination, or a dated, explicit, PO-accepted gap is recorded — an unverified
> claim of support is not support.

A session in Sprint Nova applied that literally and built a six-cell evidence matrix,
concluding that 0.5.2 was "evidenced for one runner on one platform with three
accepted gaps". The PO rejected that reading, and the objection is correct on its own
terms:

**A release is always developed on one machine.** There is no way to verify every
runner/platform combination in parallel for every change. Worse, the literal reading
is self-defeating: verify Codex on Windows, find a defect, fix it — and by that
reading every other cell is now unevidenced against the new candidate, so the fix
*reduces* the supportable surface. A definition under which improving the product
shrinks its claim is not a workable definition.

The literal reading also mislocates the cost. It puts the burden on repeated manual
verification, which is expensive, serial and perishable, when the property actually
worth defending is a property of the code — and code properties can be checked
mechanically, once, for every change.

## Decision

### 1. The support claim stands

Agent-Pipeline supports **Claude Code and Codex**, on **Windows, macOS and
Unix/WSL**. That claim is not qualified by which machine a given release happened to
be developed on, and it is not retracted by the absence of a recent manual run on any
particular combination.

### 2. The obligation is on the implementation

What ADR-0051 actually requires, and what this ADR states as its operative meaning:

- **Runner neutrality by construction.** Anything built works under both runners:
  either genuinely runner-neutral, or explicitly routed per runner. A runner-specific
  path is acceptable only with an explicit, tested path for the other runner. **Never
  a silent single-runner default** — no literal fallback runner, no environment sniff
  standing in for a threaded identity. This is unchanged from ADR-0051 and remains its
  strongest clause.
- **Shell portability by construction.** Every script, invocation and human-copyable
  command is written so it works under PowerShell *and* under an ordinary POSIX shell.
  A command rendered for one shell family only is a defect, not a platform gap. The
  existing `restartCopyCommands` POSIX/PowerShell pair is the reference shape.
- **Path and filesystem neutrality.** No assumption of a separator, a case-folding
  rule, or a permission model that holds on only one platform.

### 3. Human cross-platform verification is optional, on top, and never a gate

The PO performs manual runner/platform verification independently and in parallel with
development, and creates issues from what it finds. That work is **valuable and
non-mandatory**: it does not gate a release, its absence never retracts the support
claim, and a finding from it is an ordinary defect, not a retroactive invalidation of
the other combinations.

### 4. What is enforced is mechanical

Support is defended by properties that can be checked on every change on whatever
machine is at hand — not by a matrix somebody has to keep filling in:

| Property | Status today |
| --- | --- |
| No literal runner default in gate-critical paths | enforced by review; a check is worth building |
| Runner identity threaded explicitly through the onboarding lifecycle | in progress (dispatch `RUNNER-THREAD-17`) |
| Human-copyable commands rendered for both shell families | implemented for the restart action; not yet a general check |
| Verify suites runnable under both shells | partially — the native-Windows red set from the Cyborg sprint is a real, known defect class |

The honest position: this ADR names the right obligation, and the mechanical checks
that would make it self-enforcing are mostly **not built yet**. That is the actual
follow-up, and it is worth more than any number of manual matrix runs.

## Consequences

**Positive.** The claim is stable and truthful without a verification treadmill. The
burden moves to where it is cheap and permanent — code properties checked on every
change. A cross-platform finding becomes an ordinary bug rather than an event that
invalidates unrelated claims.

**Negative.** Support is now asserted on the strength of implementation discipline
rather than observed runs, so a systematic discipline failure could go unnoticed
longer than a manual matrix would allow. The mitigation is decision 4 — and until
those checks exist, the discipline rests on review, which is weaker. This is stated
rather than hidden.

**Explicitly retained from ADR-0051:** the known native-Windows red-suite class
(11 suites red under both Git-Bash and PowerShell, 25 under PowerShell alone, plus the
trusted-tool-resolution gap that makes `security-scan` "clean because skipped") is a
real defect class and stays tracked as such. Reclassifying evidence duty does not make
known-red suites green.

## Rejected alternatives

- **Keep the literal per-cell evidence reading.** Rejected by the PO on the grounds
  above: unmaintainable serially, and self-defeating when a fix lands.
- **Drop the runner/platform requirement to "best effort".** Rejected: the
  implementation obligation is the substance of ADR-0051 and is what actually prevents
  the defect class it was written for.
- **Make the conformance matrix a Verify gate.** Rejected: it would gate on manual
  work the PO has explicitly designated optional, and would fail on whichever machine
  is not currently in front of the developer.

## Follow-up

- Build the mechanical checks from decision 4, in this order of value: a check that no
  gate-critical path carries a literal runner default; a check that human-copyable
  commands carry both shell renderings.
- The native-Windows red-suite class stays a tracked defect class, unchanged.
- `docs/runner-platform-conformance.md` is rewritten from an evidence matrix into an
  implementation-rules document with an optional evidence log.
