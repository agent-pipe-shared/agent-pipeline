# Nova integration and close plan

## Integration packages

Shared-file changes are never incidental tail work. Create explicit packages
for:

1. reviewed Design/project-authority snapshot and exact prior Nova head/tree;
2. exact released `main` / `v0.4.7` adoption and Nova rebase;
3. conflict disposition plus regenerated Spec/backlog/lifecycle bindings;
4. central Verify suite registration;
5. ADR register and post-V3 migration projection;
6. issue/backlog reconciliation;
7. `#98` capability preflight, publication CLI, Verify resume, Critic lineage
   and release-state consistency integration;
8. Nova A Result and Nova B activation;
9. Nova-only candidate assembly and freeze;
10. final platform/runner/forge evidence; and
11. append-only Result, state, history and close metadata.

Each package declares exact write paths and resources and is planned through
the deterministic conflict model.

## Required evidence order

```text
reviewed Design/project-authority snapshot
  -> exact released v0.4.7 identification
  -> exact Nova rebase and conflict disposition
  -> impact invalidation/rerun
  -> regenerated binding/lifecycle readback
  -> focused tests
  -> diff/path/privacy checks
  -> freeze exact Nova-only candidate
  -> Full Verify
  -> Security
  -> release capability preflight
  -> independent broad Critic
  -> delta/impact-bound correction reviews if needed
  -> synthetic/non-native macOS disposition
  -> finding disposition
  -> explicit publication authorization
  -> fixed publication execution and exact remote readback
  -> PO acceptance/close disposition
  -> issue/backlog transitions
  -> close
```

An evidence artifact from an earlier candidate cannot authorize a later one.
Documentation-only changes after a gate require the applicable exact final
tail or a fresh complete gate when they change authority/security scope.

## Issue accounting

Before closure, every one of the 17 Nova issue comments must name:

- accepted merged/delivered commit and tree;
- relevant conformance/benchmark/platform/forge evidence;
- unsupported or deferred cells;
- reconciled backlog IDs;
- exact remaining criteria, if any; and
- Result path.

Bulk closure is forbidden.

## Approved scope adjustments

When PO-approved work removes a material portion of an in-scope Issue, create
one new GitHub follow-up Issue for the removed scope and assign `sprint:NONE`.
Before implementation continues, add a precise comment to the original
in-sprint Issue naming the narrowed Nova scope, the new Issue number and what
the future scope alone owns. The original Issue remains open and is closed only
at Sprint close with its exact candidate/evidence; that closure must not claim
the transferred work. This rule applies to every later Nova scope adjustment.

Issue `#72` independently owns native Apple-Silicon lifecycle and evidence;
its close is not a Nova gate. Issue `#63` independently owns the 0.4.7 hotfix;
Nova consumes it only through the exact released-baseline rebase. Issue `#98`
owns the resulting Nova delivery-loop integration and must not reopen or
relabel the completed Hotfix Issues.

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
