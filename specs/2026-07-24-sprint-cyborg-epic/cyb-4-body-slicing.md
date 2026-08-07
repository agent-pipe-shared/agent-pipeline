# CYB-4 implementation plan — threat-model lifecycle

> Implements `cyb-4-feature-spec.md` under the PO's 2026-08-01 direction to
> complete the remaining Cyborg requirements. A threat model is candidate-bound
> evidence, never an agent-issued approval, waiver, or security verdict.

| Slice | Owns | Acceptance coverage |
| --- | --- | --- |
| CYB-4A | topology class, closed machine schemas, applicability and stable identifiers | AC1–AC3, AC6 |
| CYB-4B | pure traceability and change-impact evaluator | AC4, AC5, AC7 |
| CYB-4C | generated human view, discovery contract, redaction and migration preview | AC8–AC10, AC12 |
| CYB-4D | eight-class fixture matrix and scoped Verify registration | AC11 and final evidence |

## Boundaries

- Inputs are already-observed, closed records. No model output, repository
  text, ticket, or diagram is executable instruction or approval authority.
- A required subject with absent risk inputs is `incomplete`; it never becomes
  `not-applicable`. Only a closed applicability decision may emit that state.
- Proposal records can contain observations, uncertainty and inferred areas,
  but no `approved`, `waived`, residual-risk or approval-authority field.
- A material architecture, dependency, exposure, data-flow or privilege delta
  returns the affected stable IDs only. It never silently marks a new candidate
  approved, and the resulting stale/incomplete state blocks its named boundary.
- Canonical data contains no secret, credential, private host coordinate or
  exploitable detail. Public views are derived and non-authoritative.

## Rollback

Every slice is independently reversible. If a consumer cannot process a new
schema or view, stop adoption, revert the affected slice and its Verify entry
together, and retain prior immutable candidate evidence. Never synthesize
historical approval, threat, waiver, or migration evidence during rollback.
