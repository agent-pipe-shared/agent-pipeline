# Nova post-v0.4.7 authority reconciliation

**Status:** reviewed design input; no delivery, issue-closure, publication or
PO-acceptance claim.

## Purpose

Restore one current, truthful Nova authority chain after the exact `v0.4.7`
rebase and the delivered Issue #98 recovery controls. Historical evidence is
retained unchanged; this reconciliation adds current dispositions and never
retargets an old candidate receipt.

## Observed current basis

- Released baseline: `v0.4.7` commit
  `89cb12b99e3fd86ac44878d0c23b278f00538921`, tree
  `b6537dcaa7bee526d9a393e2603b28648f4b0438`.
- Rebase adoption map: the original Nova range is retained in
  `evidence/nova-a/delivery-loop/rebase-range-diff.txt`; its initial rebased
  post-adoption head is `94a4904a13518bed4b060ad89a17f3ba2bb36cb3`.
- Current Nova head: `44e25b8ca6f97839bede3d5fe2148790e105092d`, equal to
  `upstream/feat/sprint-nova-codex-v046` after the PO-authorized push
  readback.
- Issue #98 recovery controls are in `250da7b1f5b7dfeb39d08a9562fc9130c6c8b8fc`.
  The current Human-guard override audit validates with 15 entries.
- The canonical backlog checker accepts the append-only re-integrated Nova
  events at the current head. v0.4.7 events remain unchanged; obsolete or
  duplicate pre-rebase events were not copied.
- Current-candidate Full Verify and Security passed before this reconciliation
  documentation. They must be rerun if the candidate changes.

## Authority conflicts to correct

The following historical statements remain useful provenance but are not a
current operating instruction:

1. the PRD says that the branch has not imported `main` and keeps the plan
   revoked;
2. the issue intake says that exact rebase is the next repository operation;
3. the Result ends with stable-baseline/rebase work pending;
4. A6R assumptions still describe pre-push divergence; and
5. the handover has a current-release header but no current Nova rebase and
   candidate-gate block.

Correcting these statements changes the byte-bound PRD authority. It therefore
uses the sanctioned revoke -> update -> submit -> PO approve lifecycle rather
than treating an old approval as permission for changed bytes. The correction
does not widen scope, add an Issue, authorize a provider, or close an Issue.

## Reconciliation sequence

1. Record the post-rebase authority disposition in the PRD, intake, Result,
   A6R assumptions and handover. Keep older entries as explicitly superseded
   history.
2. Refresh lifecycle hashes and submit the exact updated PRD/Spec authority.
   A PO approval restores implementation state only after the current bytes
   are bound.
3. Build an issue-by-issue matrix for all 17 Nova Issues. Each row must name
   its current implementation/evidence, accepted narrowed scope, and any
   remaining external or native gate. Unknown is not completion.
4. Freeze a post-rebase Nova A candidate only after the matrix proves that all
   Nova A acceptance rows are either satisfied or explicitly scope-adjusted.
   Run focused checks, Full Verify, Security, a fresh high-risk Critic and
   bind the resulting Result/readback chain to that exact candidate.
5. Treat Nova B separately: local-contract evidence is provenance, while
   live-worker, Claude continuation and live GitLab requirements remain open
   unless demonstrated or explicitly moved out of Nova scope.
6. Assemble a final Nova-only candidate only after the above decisions. Its
   final tail is Full Verify, Security, release capability preflight,
   delta-correct Critic, explicit publication authorization, fixed executor
   execution/readback, individual Issue accounting, canonical ledger
   transitions and PO feature close.

## Non-goals and stop conditions

- This design does not make a historical Verify, Security, Critic, publication
  or Issue comment authorize a later candidate.
- It does not turn the local `agent-pipeline-local` plugin installation into a
  Nova product change; its two topology/cachebuster files stay uncommitted.
- It stops for a PO decision if an acceptance row needs a new external target,
  credential, provider mutation, native Apple-Silicon claim, or material scope
  transfer.

## Nova B0 compact-reentry context budget

Compact/re-entry is already Nova B0 / Issue #60 scope because it must retain
the same bounded native goal generation. The current contract proves
continuation correctness, but it does not bound the amount of bootstrap
instruction/context reloaded by a fresh Codex session after Compact.

The observed Codex symptom is approximately 15% and, in a second Compact
re-entry with a user clarification, 25% of a 250k context window consumed
immediately by re-bootstrap (up to about 62.5k tokens). The PO-directed,
runner-neutral target is a 10–15k-token bootstrap/Compact-reentry payload.
For Codex this is roughly 4–6% of a 250k window. The existing generic
pipeline-start target of roughly 75k context is therefore not sufficient and
is not an observed-host token measurement.

Before final Nova B acceptance, add an explicit B0 acceptance row that:

1. records a privacy-safe, reproducible payload measurement for normal
   bootstrap and Compact re-entry, without claiming unavailable host token
   telemetry;
2. loads only the role- and state-specific bootstrap material needed for the
   current re-entry while preserving every mandatory lifecycle, authority,
   calibration, handover, verify and continuation check; and
3. establishes a PO-approved, runner-neutral 10–15k-token budget from the
   measured baseline, with a regression fixture proving that Compact re-entry
   does not silently regress it; and
4. decomposes recovery and specialized lifecycle material into lazily selected
   modules after the minimal current-role/current-state bootstrap path has
   established its required authority readbacks.

This is an optimization of the B0 continuation path, not permission to skip
bootstrap, reuse stale authority, suppress a required readback, or replace a
typed blocker with automatic resume.
