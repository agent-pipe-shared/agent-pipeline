fix(approve-push): name both valid proof path sets on CRITICAL-PROOF-EXTERNAL-PATH

Codex greenfield run 3 (T3): approve-push was called with one external
proof path and two scratch mirror paths and refused
CRITICAL-PROOF-EXTERNAL-PATH with the text "never a copy under
scratch/", although a push does admit the repository's exact scratch
mirror when all three paths name it. For approve-push the hint now says
the three paths are one set, never mixed, and names both valid forms:
the three external paths the signing step printed, or exactly the three
scratch mirror paths of this repository (computed by the same
criticalScratchArtifactPaths the reader checks against). The other
callers keep the unchanged text.

Checkpoint-Intent: candidate 29, Codex run 3 T3
AI-Assisted: true
Dispatch: stage-0 (elephant)
