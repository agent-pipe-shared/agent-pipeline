# Durable storage for mandatory design-advisory admission

Status: proposed (PO adoption pending)

Date: 2026-09-19

## Context

The design stage requires a fresh, read-only Advisor consultation before an
implementation disposition. The consultation receipt, evidence binding,
Elephant disposition, and any bounded advisor-unavailable exception must remain
bound to the writer-owned plan and the candidate observed at admission. A
caller-supplied JSON packet, mutable lifecycle flag, or runner self-report is
not sufficient authority. Replay, candidate drift, and reuse of a one-time
exception must fail closed.

The pure evaluator in
`plugins/pipeline-core/lib/design-advisory-admission.mjs` provides the
runner-neutral predicate. This ADR proposes where its durable input should be
stored and how the implementation transition and runner boundaries should
consume it. It does not accept or authorize that implementation.

## Alternatives

1. **Writer-owned plan-approval extension (proposed):** extend the versioned
   PO-bound plan-approval record with a closed `designAdvisory` binding and
   atomically write/read it through the sanctioned pipeline-state writer.
2. **Plan sidecar:** store a separate immutable advisory record beside the
   plan and place only its digest/path in plan approval state. This reduces
   state-schema size but creates a second authority lookup and a path/replace
   race unless the writer owns both records transactionally.
3. **Runner-local receipt storage:** let Claude, Codex, or Antigravity retain
   route receipts and let guards infer readiness. This cannot provide one
   common authority, permits runner drift, and makes replay/revocation
   semantics inconsistent; it is rejected.

## Proposed decision

Adopt alternative 1, subject to PO approval. Add a new versioned,
closed-shape `designAdvisory` field to the PO-bound plan-approval schema. The
field contains the original-input/PRD/Spec/design/evidence digests, candidate
commit/tree, dispatch and sanitized Advisor receipt digests, Elephant
disposition digest, route and status, and—only when advice is typed
unavailable—the failure class and a one-time final PO approval reference.

The writer must atomically bind this record to the active plan and candidate,
read it back, and consume an unavailable exception exactly once. The
implementation transition validates the readback with the shared evaluator
before changing phase. The lifecycle and Edit/Write guards repeat the same
predicate as defense in depth. AGY's live host must resolve this stored record
before launch; Claude and Codex use the same common gate and their selected
fresh/native consultation route does not create additional authority.

An ordinary successful consultation requires both a fresh read-only receipt and
an Elephant accept/decline rationale. The exception authorizes only omission of
the Advisor result: it does not waive readiness, candidate binding, final PO
approval, or implementation authority. A new candidate or changed governed
digest requires a new consultation/admission. Replaying an old record,
changing its unsigned labels, or reusing a consumed exception is rejected.

## Consequences

The plan writer becomes the single durable authority and all runners consume the
same candidate-bound record. Atomic readback gives crash recovery a fail-closed
state and makes stale/replay tests deterministic. The plan-approval schema
requires a versioned extension and migration/compatibility tests. The
evaluator remains pure; receipt production and human approval remain separate
operations.

This proposal claims no OS isolation, effective-model attestation, or global
host enforcement. Existing runner-specific capabilities remain typed evidence,
not inferred authority.

## Affected contracts

- `pipeline.design-advisory-admission.v1` evaluator contract.
- Versioned PO-bound plan-approval/pipeline-state writer and readback.
- Design→implementation transition and both lifecycle guards.
- AGY live-host admission; Claude/Codex common guard entry.
- Tests for candidate drift, replay, crash, stale receipts, runner routes, and
  unavailable-exception consumption.
