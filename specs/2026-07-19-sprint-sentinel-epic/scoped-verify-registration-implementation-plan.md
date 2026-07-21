# SNT-7 scoped Verify-registration implementation plan

## Bound package

- Test contract commit: `c0e434fef8496d993c5ff0fb5b78c46830a8133a`
- Initial implementation candidate: `cdb1b65885c92ccf08d909b2d1152c95159af9ba`
- Authority: `prd_sentinel-epic.md` and `spec.md`, SNT-7 only.
- Scope: one static registration for
  `plugins/pipeline-core/lib/scoped-verify-registration.test.mjs`; no dynamic
  discovery, command input, registry persistence, or registration for another
  backlog item.

## Required checks

1. The focused contract test rejects every authority, path, target, schema, or
   duplicate drift and accepts only the named SNT-7 suite.
2. The single Verify writer emits candidate-bound JSON evidence for both a
   successful run and an invalid scoped registration (the latter is non-zero).
3. Full Verify and manifest-bound security evidence bind the exact candidate.
4. A fresh independent Critic reviews the fixed candidate before any push.

## Rollback

Before a push, discard this package only by creating a normal revert of the
implementation commit(s); do not edit generated evidence or bypass the Verify
gate. Reverting `cdb1b65885c92ccf08d909b2d1152c95159af9ba` restores the former
static Verify list while leaving the independently frozen test contract
unregistered and inert. If the test contract must also be removed, revert
`c0e434fef8496d993c5ff0fb5b78c46830a8133a` in a separate normal revert.
After either revert, run the configured Verify command to write evidence for
the new candidate; no backlog status or ledger record changes as part of this
rollback.
