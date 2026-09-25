# Draft: Explicit lower-assurance Agy E3 admission

## Status

Proposed on 2026-09-25. The PO requested a separately approvable design if
an isolated test cannot establish that Agy's transcript channel is independent
of the Agent tool. This draft grants no E3 admission or native-hook PASS.

## Date

2026-09-25.

## Context

Alfred Spec §4.1 makes A1 the measured source of native runner-hook truth.
Spec §8.1 requires a current Antigravity A1 row before E3's provider-free
fixture caller may run. An Agy transcript path or JSON marker can be emitted
by the same Agent tool that the probe is testing. Without an independent host
observation, that marker cannot prove native hook execution. Treating it as
`fires` would both overstate A1 and silently open E3's prerequisite.

## Decision proposed

Add a separate `host-observed-unattested` assurance class, never an alias of
`native-hook-measured`. It can support only a bounded, provider-free E3
packet-to-boundary fixture under an explicit PO disposition. It cannot satisfy
the general A1/A2 claim that a native subagent hook fired, certify sandbox
containment or model identity, or authorize live provider work, write access,
push, release, or other runner routes.

The host, not the Agent tool, must capture the exact child invocation,
executable identity, start/exit observation, result-file bytes and the loaded
plugin identity. It records which facts are independent host observations and
which are Agent-reported data. The transcript and marker remain untrusted
inputs even when their digests match. An isolated negative probe must show
that a child-authored forged marker does not change the host's classification.
If the host cannot establish even this weaker boundary, the disposition is
`unavailable`.

The proposed PO disposition names the exact E3-only scope, source candidate,
runner and plugin versions, evidence digests, residual gap, review date and
rollback. The existing signature-or-chat ceremony must read it back before
any E3 consumer recognizes it. A mere record-local boolean or self-declared
approval is not authority. A changed source or runner/plugin version needs a
fresh observation and disposition; an ordinary later commit must not silently
reuse an obsolete candidate-bound fixture result.

E3 then produces a separate result such as `fixture-pass-lower-assurance`,
never `native-conformance-pass`. The A1 row continues to say `unknown` for
unproven native-hook families, and A2 retains their residual gap. The normal
native-measured path remains available and preferred; the weaker path is
opt-in, explicit and reversible.

## Consequences

The provider-free E3 fixture can be assessed without fabricating native-hook
evidence, while users and reviewers can distinguish host-observed execution
from runner-native enforcement. This is a material relaxation of E3's current
precondition and therefore requires a Spec amendment, an independent Critic
review and PO approval before implementation may activate it. Until then the
existing `unavailable` gate remains correct.

## Affected contracts

- Alfred Spec §4.1 A1 classification and §8.1 E3 precondition/readback.
- A2 control placement and its residual-gap semantics.
- `pipeline.enforcement-conformance.v1` and the E3 gate-readback schema.
- Agy host observer, E3 fixture caller, Verify/Security evidence and the
  portable provenance boundary.

## Required verification

Test genuine independent host capture, forged child marker and transcript,
missing/changed executable, stale plugin version, candidate drift, missing PO
disposition, expired review date, and the complete provider-free E3 fixture
matrix. Read back both A1 `unknown` and the explicitly lower-assurance E3
result; neither may be normalized into native `fires`. A real Agy process and
independent review are required before accepting the alternative, while live
provider execution remains a separate authorization.
