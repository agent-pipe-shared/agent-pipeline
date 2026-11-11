feat(critic): size parts to the budget and keep reviews to their sources

- critic-split derives the part bound (14 changed files) from the
  Critic's turn limit, working cap, checkpoint, fixed calls and two reads
  per file; the briefed tool budget scales with the path count and every
  part prints its sizing (held patch C28-CRITIC-TOIL, Goldfish-built).
- The generated briefing carries a diff command with literal source paths
  only; a Critic's Read, Grep, Glob or Bash naming a path the
  correction-input bindings exclude refuses CRITIC-READ-EXCLUDED-BY-BINDING.
- A missing bindings file refuses CBB-BINDINGS-MISSING and prints the
  review paths.
- A message to a running Critic is admitted only as the generated resume
  text of its recorded grant (DISPATCH-BUDGET-CRITIC-RESUME-NOT-GENERATED);
  Elephant: the budget hook matcher now names SendMessage, in hooks.json
  and in the wiring script.
- The finalize result and the journal show the model verdict, the policy
  decision and the remaining findings separately.

AI-Assisted: true
Dispatch: stage-0 (elephant)
