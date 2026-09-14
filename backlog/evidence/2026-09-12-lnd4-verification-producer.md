# LND-4 verification producer

Date: 2026-09-12
Scope: ADR-0083 LND-4, aggregate verification action producer

Implementation commits `bf2a0956` through `720d1785` add the shared closed
verification-action builder, consuming-project and self-repository producer
paths, explicit create-only artifact publication, physical readback and a
closed event-only retry. The producer emits exactly one candidate-bound action
from terminal aggregate Verify evidence when an output path is requested.
Running without that argument retains the previous output and source-evidence
contract.

The implementation pass also corrected three failures exposed by the complete
candidate verification: missing fixture imports and a stale Tier-B declaration,
an overlong WSL IPC fixture path under an external `TMPDIR`, and concurrent
lifecycle probes launched by one multi-file apply-patch invocation. The latter
now retains parallel independent guards while serializing repository-scoped
lifecycle probes.

Full Verify command:

```text
TMPDIR=/home/skar667/agent-pipeline-verify-tmp PIPELINE_VERIFY_CONCURRENCY=2 node harness/scripts/verify.mjs --mode critic --base 6c624889812b3f625cc3cedda7ef1248fc8457df --event-out evidence/actions/lnd4-720d1785-diff.json
```

It completed with exit code 0 and 539/539 successful steps. Machine evidence
`evidence/verify-1789205923703-7084145eabd9528d.json` binds the clean candidate
commit `720d1785840ec500016c48b3aa5ba56831af44bd` and tree
`bcee3732fbce98919966efc404f27e54544e140e`. The emitted action reports
`completed/VERIFICATION_PASSED`.

The final independent fresh-session Critic reviewed
`c8890e08c0b3b4ec29d5d7a4e04d07dbad810406..720d1785840ec500016c48b3aa5ba56831af44bd`
against the parent item and both declared governance roots. Its assurance was
`functional-equivalent-read-only; OS isolation not asserted`. It returned PASS
with no findings and judged the trajectory consistent with the exact Verify
evidence. The Critic explicitly cleared shared-builder fidelity, self/consumer
integration, target preflight, create-only publication, physical readback,
idempotent retry, no-output compatibility, runner-identity exclusion, direct
failure paths, the lifecycle-probe correction, architecture guidelines and the
applicable policy checklist.

LND-4 is complete. The parent backlog item remains open for LND-5 through
LND-8 and its separately recorded HGO decision.
