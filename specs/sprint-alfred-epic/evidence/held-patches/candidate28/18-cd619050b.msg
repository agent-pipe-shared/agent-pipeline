feat(guard): allow recursive deletes only in throwaway folders

A recursive delete with an unset variable can remove a whole worktree, and the
guards admitted forms such as find docs -delete, rm -rf docs and an rmtree
one-liner. A recursive delete now runs only under scratch/ and in folders the
project names in its guard config as throwawayDirs, each spelled literally. The
refusal names the target and the allowed route. A script that deletes on its
own is still outside this rule.

AI-Assisted: true
Dispatch: stage-0 (elephant)
