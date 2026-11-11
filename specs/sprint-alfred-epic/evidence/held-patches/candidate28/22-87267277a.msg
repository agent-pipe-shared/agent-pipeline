fix(guard): say why a git read with a backslash is refused as a push

A plain read such as `git config --local --get-regexp ^user\.` got "push target
is not unambiguous" with no hint that the backslash was the reason, and a run
lost its only check of the local author right before a commit. The fail-closed
marker rule stays as it is. The refusal now names the backslash and a spelling
that passes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
