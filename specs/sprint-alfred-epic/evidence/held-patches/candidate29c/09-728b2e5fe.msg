fix(dispatch-briefing): quote the printed heal command so it survives a shell

Glossover K-26: the DBG-SETTLED-PENDING-HEAL warning printed the
routine-repair heal command as a bare join of its argv, so the
multi-word --reason split into several shell words when copied, and
routine-repair refused with RR-ARGS.

- Every argument that is not a plain word is single-quoted in the
  printed command; the preDispatch argv is unchanged.
- The W-test asserts the quoted reason at the end of the message.

Checkpoint-Intent: candidate 29c, Glossover K-26
AI-Assisted: true
Dispatch: stage-0 (elephant)
