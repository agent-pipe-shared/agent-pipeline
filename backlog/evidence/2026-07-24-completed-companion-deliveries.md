# Completed companion-delivery disposition — 2026-07-24

## PO disposition

The PO closed two delivered Public Core work packages on 2026-07-24:

- `pipeline.observation-intake-document-governance`
- `pipeline.private-overlay-activation-bridge`

Closure means the implementation work described by each item is complete. It
does not retire either product capability.

## Observation intake and document governance

This package is independent of GitHub Issue `#53`. Issue `#53` concerns V3
consumer onboarding and is not closure evidence for this item.

The item's own delivery record binds:

- ADR-0042 observation and document governance;
- the closed Issue Form and `capture-observation` skill;
- target-bound repository references and privacy routing;
- complete document audience/lifecycle inventory enforcement;
- an independent correction-delta data-privacy PASS;
- focused tests; and
- exact-candidate Verify evidence.

The current released candidate continues to pass
`harness/scripts/check-observation-governance.mjs` and Full Verify.

## Private-overlay activation bridge

The item's SNT-A implementation checkpoint records SNT-A1 through SNT-A4,
focused fail-closed coverage, aggregate Verify registration, slim-overlay E2E
coverage, Full Verify, and an independent bounded Critic PASS. Subsequent
Public releases completed the portable activation and authenticated authority
update path.

The accepted release baseline is:

- Release: `v0.4.1`
- Commit: `81cc5f1a6cb384057fd49dd1a340e93c3aec3efb`
- Tree: `ec4fcf2e84b15a580dbc13d98198204e8cfca429`
- Exact Verify evidence: `evidence/verify-latest.json`, `exitCode: 0`
- Exact Security evidence: `evidence/security-latest.json`, `exitCode: 0`

A consuming project's later `inspect → plan → activate → status/load-context`
cycle is product use and project-specific evidence. It is not remaining
implementation scope for this Public Core backlog item.
