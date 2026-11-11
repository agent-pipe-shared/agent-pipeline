fix(architecture): read only the newest retained approval of a feature

A reopened design is signed again under the same feature. The earlier retained
reference stays beside the new one, but its bound sources changed, so verifying
it failed and took the whole authority reader down: a run on native Windows
could not enter implementation again. Skipping an older entry removes authority
and never adds any. A forged newer entry still has to pass full verification.

AI-Assisted: true
Dispatch: stage-0 (elephant)
