# Verify case-completion contract — bounded design

Date: 2026-09-11

The existing Verify journal proves process completion and binds exit/log
bytes. It cannot prove that a suite declared and disposed every intended test
case. Parsing a final stdout line would cover only a subset of the 169 affected
files and would remain forgeable or absent in legitimate red runs.

The proposed incremental contract is:

1. `pipeline.test-case-completion.v1` uses a bounded inherited descriptor,
   separate from reporter output. A helper synchronously registers a stable,
   unique ordered case set with `node:test`, emits `DECLARED`, emits one
   `DISPOSED` record from every callback `finally`, and emits `TERMINAL` with
   the exact set/count/digest. A failed case stays red while siblings continue.
2. A closed registry inventories all 170 affected Verify registrations as
   `required` or `legacy-process-only`. New suites cannot start as legacy.
   Touching a legacy test requires migration in the same candidate.
3. Verify captures and validates the bounded descriptor independently of the
   suite exit. A missing terminal, unknown/duplicate case, digest mismatch,
   crash or overflow is a coverage failure. Receipt reuse also revalidates the
   bound completion policy and attestation.
4. Existing receipt v1 remains readable. Required suites produce receipt v2;
   old receipts cannot satisfy required case coverage. Legacy entries retain
   an explicit partial/process-only claim while migration proceeds.
5. ADR-0081 impacted selection runs and attests only selected suites. Changes
   to the helper or registry force the safe broad boundary. Omitted suites are
   never relabeled as executed.
6. Consumer `verifyImpact` commands may opt into the same versioned descriptor
   policy. Without opt-in, generic commands remain process-only. New JavaScript
   onboarding examples can use the helper from the start.

Primary implementation surfaces are a new helper and tests under
`plugins/pipeline-core/lib/`, a versioned registry/schema/checker under
`harness/`, `verify-journal.mjs` and receipt/resume validation, one Verify
registration, ADR-0081/QG-01 documentation, and optional consumer-verify
transport. Focused acceptance includes early-failure continuation, missing or
malformed terminal data, ordinary-red-but-complete behavior, policy-bound
reuse, legacy compatibility, impacted omission and consumer FD propagation.

The helper is implemented in `0a163a26`; the schema, 172-entry registry and
checker are implemented in `ee35f669`. The extra two entries retain migrated
source suites whose self-probe invocation is not yet the normal standardized
descriptor path. All entries remain `legacy-process-only`, so Verify capture,
receipt binding and incremental suite migration remain open. No Full Verify is
claimed by this checkpoint.
