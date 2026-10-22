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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **CORRECTED the same day (the survey was wrong):** the v4 native contract is ALREADY IMPLEMENTED in `human-guard-override.mjs` (commits `348b421f3`, `a9aeb9d63`, `32cd213b7`; suite `human-guard-override-disjoint.test.mjs`, 35 cases HGOD001-035 covering the Acceptance bullets, 35 pass measured alone in a clone). No protected patch and no signature is needed. What remains: re-triage (this file still says `status: open`), an independent Opus Critic read of those commits (D119), and PO acceptance.

## Reconciled 2026-10-23

Text sweep K58-BACKLOG-TEXT-SWEEP-2. Superseded sentences above, kept as history:

- Description and Acceptance ("makes a second, independently signed and armed action unusable"; "Until a safe contract is
  implemented, the signing preparer must disclose that separately signed dirty-worktree actions are serially dependent"):
  the native Edit/Write/apply_patch contract is implemented. Decision D132 (2026-10-22, Elephant correction) records that
  the v4 native contract needs no patch and no signature: commits `348b421f3` (`fix(pipeline-core): bind apply_patch
  overrides to native target preimages`), `a9aeb9d63` (`test(pipeline-core): cover every drift and replay case of
  disjoint signed overrides`) and `32cd213b7` (`test(pipeline-core): run the disjoint HGO cases in parallel workers`),
  suite `plugins/pipeline-core/lib/human-guard-override-disjoint.test.mjs` (cases registered as HGODnnn; D132 records
  35/35 measured, not re-run in this sweep). The Bash and plugin-installation lanes keep strict whole-repository
  binding by the Acceptance text itself.
- Blocker analysis 2026-10-22 (first, survey-based sentence "re-triage" and the earlier survey that treated the item as
  needing a protected patch): the survey was wrong on this item, per the CORRECTED paragraph and D132. Remaining, and
  not agent work: an independent Opus Critic read (D119) and PO acceptance. The item has no Triage block, so none was
  filled; the front-matter `status: open` is left unchanged.
