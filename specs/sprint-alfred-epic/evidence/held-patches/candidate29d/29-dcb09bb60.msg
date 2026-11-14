fix(agy-native): check the scope of every landed commit, not only the end state

A fast-forward lands each commit of the branch unchanged, so a commit
that touched a path outside the dispatch scope stays in history even
when a later commit of the same branch undoes it. The end-state diff
did not show that.

fastForwardFacts now runs git diff-tree per commit and makes the
branch ineligible for --keep-authorship when any single commit touched
a path outside the allowed scope; the patch route stays available.
Pin: a third branch in the second "C29 R5" case adds docs/outside.md
and removes it again.

AI-Assisted: true
Dispatch: stage-0 (elephant)
