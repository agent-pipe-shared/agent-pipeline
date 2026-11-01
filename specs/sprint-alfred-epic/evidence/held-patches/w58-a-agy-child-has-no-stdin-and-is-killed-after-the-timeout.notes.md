# w58 — the AGY child gets no stdin, its own process group and a SIGKILL after the bounded timeout (candidate 17, slice 13)

Applies on the nine-patch chain; touches `lib/antigravity-execution-host.mjs`, its test and the case-id list of that suite in `harness/scripts/verify.mjs` (24 to 26 cases).

## What went wrong

In the Antigravity greenfield run the implementation dispatch cost about 22 minutes without a result. The cause of the whole loss is a design gap (see the slice 11 notes: the route is the
Codex-to-Antigravity route and an AGY-hosted Elephant has no sanctioned implementation dispatch). Independently of that, the child launch was not tight:

- the child was spawned with the default stdio, so its stdin was an open pipe that nothing wrote or closed;
- a timeout or cancel sent SIGTERM only, to the child, not to its group;
- after one second the parent reported the process "unclosed" and left it running.

## Change

- `stdio: ["ignore", "pipe", "pipe"]`: the prompt travels in argv, the child has no stdin to wait on.
- On POSIX the child leads its own process group (`detached`), so a stop reaches a wrapper's grandchildren; Windows keeps `child.kill()`.
- Stop: SIGTERM, then SIGKILL after the existing one-second window, then the unchanged `finish(forcedStop)` (code timeout or cancelled, `processClosed` only when close was observed).
- Tests EPH25 and EPH26: a child that waits for the end of stdin finishes at once; a child that ignores SIGTERM is dead after the bounded timeout (its pid is polled).
  Mutation-checked both ways: default stdio turns EPH25 red; removing the SIGKILL leaves EPH26's child alive and the suite does not end (stopped by hand). Originals restored from backup.
  The suite passes 26 of 26.

## Not changed / not proven

- No claim that this was the cause of the 22 minutes. A real AGY child launched from inside an AGY session was not run here.
- The family launch path (`launchModelFamilyInvocation`) was not read and is unchanged.
- Windows process-tree termination is unchanged.
