fix(commit-message-policy): GIT-03-DISPATCH-MISSING names split -m trailers and the git commit -F form

Antigravity greenfield run 3 (R8) was refused GIT-03-DISPATCH-MISSING
after `git commit -m .. -m ..`: each -m starts a new paragraph, so the
Dispatch line ended up outside the final trailer block. The git-guard text
already named the -F form, but the commit-msg hook only printed the bare
finding. The finding detail itself now says that a Dispatch line is in the
message but separated from the last block, and names
`git commit -F scratch/<message-file>`; an absent Dispatch line names the
accepted trailer form. Both the hook and the guard print the detail.

Checkpoint-Intent: candidate 29, AGY run 3 R8
AI-Assisted: true
Dispatch: stage-0 (elephant)
