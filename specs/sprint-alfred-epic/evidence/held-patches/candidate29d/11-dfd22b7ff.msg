fix(guard): give a ; list of reads a per-part verdict and drop a root cd

In the third Claude greenfield run, 20 of 48 grammar refusals were one
shape: "cd <project root>; <read>; <read> | head -80; ...". The typed
retry envelope stayed empty (a cd is no read, a pipeline part has no
single executable), and no hint said which part was the problem, so the
agent guessed.

A "cd" to the absolute project root is now left out of the typed retry
actions: every command is judged against that root anyway. A list the
v1 envelope still cannot type gets message text instead: each part,
judged by the same classifier a standalone call meets, listed as
admitted exactly as written or as not an admitted read-only form. The
text never admits anything and the decision is unchanged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
