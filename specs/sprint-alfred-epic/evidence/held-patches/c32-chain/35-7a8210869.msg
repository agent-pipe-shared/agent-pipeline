docs(backlog): the Pipeline does not meet the module and size rules it imposes on projects (0.7.0)

PO observation 2026-11-19: releasing a modular, agent-suited architecture as the promise while the Pipeline's own source breaks its module boundaries would contradict it. Measured with architecture-boundary-check.mjs and a size and import survey of the candidate 32 tree: 64 of 1160 hand-written source files are over the 1000-line bound and hold 37 % of the code (four over 5000 lines, the largest 16,030), the boundary policy carries 103 size exceptions with several already outgrown, the whole plugin is one module of about 1,030 files, 38 files of lib/ import from scripts/ (the layering is inverted) and nine folder pairs import each other, and three god files (worktree-lifecycle, onboarding-continuity, pipeline-state) have 71, 42 and 29 importers.

The item states what is not measured (defect or speed effect, responsibilities per file, runtime coupling) and proposes a staged answer for 0.7.0: first make the map true (real modules, declared dependencies, no more ratchet raising), then restore the layering with a rule that keeps it, then split the files by fan-in times size as bounded, behaviour-preserving clone-slice scopes that can run in parallel, and decide explicitly what the release promises about its own source; the numbers go into the release evidence and may not grow.

AI-Assisted: true
Dispatch: stage-0 (elephant)
