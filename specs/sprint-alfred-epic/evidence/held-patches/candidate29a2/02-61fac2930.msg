fix(architecture-fitness): class 7 skips docs/adr/ tokens that are no file and no numbered ADR name

After candidate 29a the Glossover run's implementation entry was refused
by navigation currency (PENDING-FITNESS-NAVIGATION-UNPROVEN): the PRD
names "docs/adr/00NN-" and "docs/adr/draft-" in prose and the draft
name of an ADR that has since been numbered. None of them is a
navigation target, yet each counted as a touched ADR no module
references, so the map read as stale.

A docs/adr/ token that is neither a file on disk nor named like a
numbered ADR (NNN-<name>.md) is now skipped. A planned numbered ADR is
still checked before it is written (AC-127), a prefix form keeps its
rule, and an existing ADR file (a draft included) that no module
references is still stale.

Checkpoint-Intent: candidate 29, Glossover K-23 (navigation currency after 29a)
AI-Assisted: true
Dispatch: stage-0 (elephant)
