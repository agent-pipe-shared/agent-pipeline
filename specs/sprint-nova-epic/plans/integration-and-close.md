# Nova integration and close plan

## Integration packages

Shared-file changes are never incidental tail work. Create explicit packages
for:

1. central Verify suite registration;
2. ADR register and post-V3 migration projection;
3. issue/backlog reconciliation;
4. Nova A Result and Nova B activation;
5. Nova-only candidate assembly and freeze;
6. final platform/runner/forge evidence; and
7. append-only Result, state, history and close metadata.

Each package declares exact write paths and resources and is planned through
the deterministic conflict model.

## Required evidence order

```text
focused tests
  -> diff/path/privacy checks
  -> freeze exact Nova-only candidate
  -> Full Verify
  -> Security
  -> independent Critic
  -> native Apple Silicon evidence
  -> finding disposition
  -> exact remote readback where authorized
  -> PO acceptance
  -> issue/backlog transitions
  -> close
```

An evidence artifact from an earlier candidate cannot authorize a later one.
Documentation-only changes after a gate require the applicable exact final
tail or a fresh complete gate when they change authority/security scope.

## Issue accounting

Before closure, every Nova issue comment must name:

- accepted merged/delivered commit and tree;
- relevant conformance/benchmark/platform/forge evidence;
- unsupported or deferred cells;
- reconciled backlog IDs;
- exact remaining criteria, if any; and
- Result path.

Bulk closure is forbidden.

## Backlog accounting

Backlog state is changed only through the canonical transition mechanism.
Issue closure is not backlog closure. The 13 Nova reconciliation claimants in
`design/backlog-intake.md` require their own criteria, evidence and transition.
Issue #57 additionally initializes its own canonical record through the
sanctioned generic path it delivers.

Nova/Cyborg exact-OID reconciliation is a separate post-Sprint lifecycle. It
cannot change the frozen Nova candidate after native/final evidence or become
a hidden prerequisite for Nova close.

## Rollback

- Before external delivery: revert the affected slice and invalidate its
  candidate evidence.
- After a delivered feature-branch commit: use an ordinary revert; do not
  rewrite shared history.
- External GitLab/remote mutations require their adapter-specific compensating
  action and readback.
- Credential leases are revoked independently of repository rollback.
- Historical Result/evidence remains retained and append-only.
