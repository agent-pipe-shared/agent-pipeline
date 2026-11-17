fix(antigravity): a native read of the pipeline-start skill consumes the bootstrap barrier

The session bootstrap barrier was consumed only by a shell read of the pipeline-start
skill (cat, sed -n). The host's own native read_file of the same file went through the
read-only path and left the barrier armed, so a Critic or Goldfish that read the skill
natively was denied on its first shell call (first Antigravity greenfield run: three
barrier denials in the Elephant, one in the Critic). A native Read of exactly that file,
after the ordinary native-read target check, now removes the marker. Any other file
leaves it armed. Test C30E-BAR1 (red without the change).

AI-Assisted: true
Dispatch: stage-0 (elephant)
