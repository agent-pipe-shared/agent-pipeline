---
schema: pipeline.backlog-item.v1
id: pipeline.disjoint-signed-hgo-actions-invalidate-one-another
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "0.7 evening integration: three disjoint exact native actions were signed and armed; delivering the nine-file action changed whole-repository status and invalidated the two remaining capabilities despite unchanged tool-input digests and target preimages. See scratch/0.7-evening-signature-batch-20260929/serial-override-invalidates-disjoint-plans.md."
sprint: alfred
done_when: manual
---

# Disjoint signed HGO actions invalidate one another after the first delivery

`repositoryObservation()` hashes whole-tree Git status into the HGO request.
`consumeHumanGuardOverride()` compares the signed observation to the current
whole repository. The first authorized edit therefore makes a second,
independently signed and armed action unusable even when its exact tool input,
eligible paths and target bytes remain unchanged. New denials produce new
request digests. The 0.7 nine-file, one-file and two-file delivery reproduced
this; the latter two needed fresh PO signatures solely because the first
action changed unrelated paths.

This is distinct from
`2026-09-28-stale-hgo-capability-shadows-current-authorization.md`, which
concerns searching past an obsolete capability after a replacement has been
armed. It also differs from an expired or tampered proof.

## Acceptance

- For native Edit, Write and apply_patch file actions only, bind sorted
  eligible targets to
  physical path identity and exact regular-file content or absence preimages.
  Reclassify the action at consumption and require the exact signed target
  set. Recheck those targets, policy, plugin, lifecycle state, denial set, expiry,
  authenticated audit and tool input at consumption. Preserve HEAD/tree
  conditions at the signed arming boundary.
- Permit an unrelated authorized worktree edit to occur between arming and
  consumption without forcing another PO signature for a disjoint action.
  Target content, path ancestry, policy, plugin, state or tool-input drift must
  still fail closed. Preserve strict whole-repository binding for every Bash
  action and plugin installation until their effects can be closed and proved
  by a separately reviewed classifier; current Bash eligibility may have
  incomplete or empty eligible paths.
- Exercise three independently signed disjoint actions with two sequential
  deliveries, plus target-byte, target-absence, symlink, policy, plugin,
  expiry, replay and audit-integrity drift. Existing request/capability
  versions retain their current strict behavior; a new contract is explicit.
- Until a safe contract is implemented, the signing preparer must disclose
  that separately signed dirty-worktree actions are serially dependent and
  request the next signature only after the preceding delivery.

Do not simply ignore `statusSha256`: the current capability does not bind
target preimages, so dropping the comparison would also admit target drift.
