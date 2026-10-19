# Triage of the PO report `scratch/pipeline-feedback-03.md` (D56)

The PO's rule (D56): blockers and majors land in this candidate, everything else becomes a
backlog item for later. The report numbers its own findings. Its PF-54, PF-55 and PF-56 are
not this repository's PF-54 (D53) and PF-55 (D50-D52), so they are named FB3-PF-54,
FB3-PF-55 and FB3-PF-56 here. The report's status column was written against
`200125.d5686dc` for most rows. Several rows are fixed by commits after that build. A fix
counts as built, not accepted, until the PO confirms it in the main project.

| Report id | Class | Now or later | Status in this repository | Backlog item |
|---|---|---|---|---|
| FB3-PF-55 | blocker (orphaned `registry.lock`; heal and move-aside refuse; recurred 2026-10-20) | now | in progress | `2026-10-20-an-orphaned-registry-lock-blocks-every-dispatch.md` |
| FB3-PF-56 | part of the blocker (no wait route, no owner and age in the refusal) | now, with FB3-PF-55 | in progress | same item |
| FB3-PF-54 | major (PO): the architecture map is not enforced | now, first stage per D56 (1) | open | `2026-10-20-the-architecture-map-is-not-enforced.md` |
| PF-31, PF-36, PF-40 | major: Pipeline-owned files dirty the tree; PF-36 cost a signature | now, per D56 (2) | open | `2026-10-20-pipeline-owned-files-dirty-the-push-tree.md` |
| PF-32, PF-33 | major: a checkpoint push burns a signature; the stale-approval repair does not exist | now, per D56 (3) | open | `2026-10-20-checkpoint-push-policy-is-checked-too-late.md` |
| PF-34 | major: no admissible Critic review for a running batch (`SCF-REVIEW-UNIT-REQUEST`; this repository hit the same as `CCA-REVIEW-UNIT-REQUIRED`) | now | open | `2026-10-20-a-running-batch-has-no-admissible-critic-route.md` |
| PF-50 | defect (PO) | now | `unbound-no-session-identity` repaired by heal (34835cc8e, D54 (1)); `catalogue-source-closure` by D48; the take-over of the continuity binding (`session-cleanup start` refusal) is D52 (1), still open as Critic F1 | `2026-10-19-session-authority-repair-gaps-after-pf55.md` |
| PF-52 | blocker on `d5686dc` | confirm | built: `prepare-push-subject` and the other unadopted State routes run while a catalogue exists (D53, 426e4afbe) | `2026-10-19-state-routes-refused-once-a-registry-catalogue-exists.md` |
| PF-51 | blocker on `d5686dc` | confirm | built: a commit-integrated or cancelled slice no longer collides (D51 (2)); a refused dispatch writes no queue row (NGHS37); `cancel` needs no bound session (D51 (3)) | `2026-10-19-a-push-leaves-the-next-item-dispatch-refused.md` |
| PF-53 | blocker on `d5686dc` | confirm | built: the collision after the host commit is D51 (2), and the refusal names the holding slice; the continuation route for a budget-stopped item is PF-30 | same as PF-51 |
| PF-45 | open, bridged | confirm | built: `slice-queue.mjs cancel` (D45), from any shell (D51 (3)); an AGY reservation now also counts as started (Critic F2) | same as PF-51 |
| PF-30 | observation: budget runs out before the DoD checks; no documented continuation route | later | open | `2026-10-20-report-03-later-findings.md` |
| PF-35 | observation: the mechanic tier refuses test authorship inconsistently; `architecture: true` set for every diff | later | open | same |
| PF-37 | open: a non-isolated Goldfish cannot read a stopped dispatch's worktree | later | open | same |
| PF-38 | open, bridged: GIT-03 resolves a message file against the worktree root | later | open | same |
| PF-39 | open: `git apply <patch>` is refused as unbound targets | later | open | same |
| PF-43 | open: host commits without `Commit-Act: orchestrator` have no migration route | later | open | same |
