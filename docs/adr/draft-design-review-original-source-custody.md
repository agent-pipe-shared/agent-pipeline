# Original Source custody for independent design review

Status: proposed; direction selected by the PO in D144, exact package pending.

Date: 2026-10-25

## Context

G8 requires design-review receipts to originate from an independent review
execution. Caller-authored receipt bytes and matching file hashes cannot prove
that execution. The approved one-review course and its two-round limit remain
binding. The existing Source/Model registry already owns original invocation
and publication observations; G17 qualifies publication reconciliation, not the
complete design-review producer or its active consumers.

The preserved [contract proposal](../../specs/sprint-alfred-epic/evidence/local-candidate-2026-10-25-followups/g8-proposed-contract/proposed-contract.md.txt)
describes the missing boundary and two alternatives. D144 selects its Choice A.
This draft records that direction without accepting unqualified prototype bytes
or changing the approved PRD or Spec.

## Selected direction

Extend the existing Source-owned native review preparation, terminal capture
and registry readback with the current-artifacts design subject. Retain the
actual author/reviewer execution relationship, candidate, reviewed source and
criterion digests, round and predecessor receipt. Use the existing registry
to recover original custody across separate create, present and sign commands.
Add no principal, key family or ledger.

A public origin locator identifies existing original facts; possession of its
JSON bytes grants no admission. Source-owned readback must verify the original
invocation/publication and subject before either active design-approval binding
consumer writes effects. Missing custody refuses with a typed reprepare action.
Preserve the pure binding kernel, source-delta disclosure after round two and
the explicitly weaker fallback classification. A fallback never becomes an
independent review PASS.

## Alternatives and consequences

Same-process review/presentation was the alternative. It would change the
separate-command workflow and still require original custody when later signing
revalidates the subject. The selected registry route preserves that workflow
but requires bounded integration and qualification of its existing owners.

The trust, execution and consumer boundaries are architecture-significant.
The final request/locator/API bytes, relevant schemas and both consumer edits
must form one concrete package under the existing aggregate approval policy.
This draft remains proposed until that policy is satisfied; no separate ADR
ceremony or agent-written acceptance is introduced. No prototype is merged
merely because the direction was selected.

## Affected contracts and qualification

- Existing native Critic/Model preparation, captured return and registry owners.
- Both active `createDesignApprovalBinding` consumers and signing revalidation.
- Design-review request/locator and receipt/source bindings.
- Missing, stale, changed and replayed subject refusals; author/reviewer identity
  separation; original publication readback; both active consumer positives.

Focused prototype preparation tests are not independent execution evidence.
Actual producer/readback, native execution, active consumer qualification,
scheduled batch Critic, final Verify/Security and PO acceptance remain pending.
