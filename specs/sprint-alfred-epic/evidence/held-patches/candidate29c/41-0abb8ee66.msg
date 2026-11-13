fix(dispatch-budget): name the Critic's one writable notes file on its first calls

P3-2 (Claude run 3): a Critic guessed a notes directory and spent four
reads refused by its binding and five writes confined by this guard,
because its one writable path was named only inside a refusal.

The first two counted Critic calls now carry CRITIC-NOTES-PATH with the
exact scratch/dispatch/critic-<id>/critic-notes.md path (two calls,
since another hook's denial can drop one notice), and say that notes are
optional. The path rule and the confinement itself are unchanged.

Test: a real hook run names the path on calls 1 and 2, not on call 3.

AI-Assisted: true
Dispatch: stage-0 (elephant)
