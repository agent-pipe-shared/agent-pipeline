fix(dispatch): name Workspace "branch" in the Antigravity next step

prepare-dispatch told an Antigravity Elephant how to pass TypeName and
Prompt but not Workspace, the field it chooses itself; the greenfield run
chose "inherit" and was refused AGY-NATIVE-WORKSPACE-NOT-ISOLATED.

AI-Assisted: true
Dispatch: stage-0 (elephant)
