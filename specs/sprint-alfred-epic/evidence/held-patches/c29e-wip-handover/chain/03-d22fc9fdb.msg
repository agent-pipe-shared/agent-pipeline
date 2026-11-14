refactor(pipeline-state): move the closed-evidence restore/repin verbs into a lib

pipeline-state.mjs sits close to the session authority's 1 MiB
source-entry bound. The PO tile of 2026-11-14 splits it by verb group
over several candidates, one pure move per patch. This is the first
group: closed-evidence-restore-plan/apply and
closed-evidence-repin-plan/apply move unchanged into
lib/closed-evidence-repair.mjs together with their four constants.

The state-writer primitives the verbs share with the rest of
pipeline-state.mjs stay there and are passed in through
closedEvidenceRepairCommands, bound lazily at the first call. The writer
path the printed apply commands name is still pipeline-state.mjs.
CLOSED_EVIDENCE_REPAIR_SCHEMA stays exported from pipeline-state.mjs as
a re-export. The new lib joins NEVER_LIFTABLE_KERNEL_PATHS and the
threat model's protected-asset list, because a kernel path imports it.

pipeline-state.mjs shrinks from 1,040,706 to 1,016,847 bytes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
