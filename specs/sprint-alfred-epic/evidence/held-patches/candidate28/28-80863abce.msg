fix(dispatch): name the branch workspace in an Antigravity briefing

The generated briefing told every child "Worktree: no — shared checkout",
while the Antigravity guard refuses a code-writing child without
Workspace "branch" (AGY-NATIVE-WORKSPACE-NOT-ISOLATED). An Antigravity
greenfield run followed the briefing and hit that refusal. The worktree
line now follows the package runner; Claude and Codex keep the
shared-checkout line.

AI-Assisted: true
Dispatch: stage-0 (elephant)
