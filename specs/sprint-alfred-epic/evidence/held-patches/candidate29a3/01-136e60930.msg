fix(architecture-fitness): class 7 treats a draft ADR as current once the map references its numbered ADR

After candidate 29a2 the Glossover run's implementation entry was still
refused by navigation currency (PENDING-FITNESS-NAVIGATION-UNPROVEN): its
PRD names docs/adr/draft-<slug>.md, and that draft is still on disk.
Materialization writes the accepted record to docs/adr/NNNN-<slug>.md and
keeps the draft as history (create-adr.mjs), and the map references the
numbered record. A PRD that names its own draft, as the design course
needs before numbering, therefore always tripped class 7 at
implementation entry.

A touched docs/adr/draft-<slug>.md is now current when a module lists
docs/adr/NNN-<slug>.md in adrReferences and that file exists. A draft
with no referenced numbered record, or one whose referenced record is not
on disk, stays stale.

Checkpoint-Intent: candidate 29, Glossover K-23 (navigation currency after 29a2)
AI-Assisted: true
Dispatch: stage-0 (elephant)
