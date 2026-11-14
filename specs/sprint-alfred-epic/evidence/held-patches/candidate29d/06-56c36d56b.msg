test(native-host): three real stops with disjoint scopes land in one chain (K-34)

Glossover saw three parallel Goldfish dispatches with disjoint scopes
end with one host commit and two native-concurrent-unowned-head
refusals. The stop-pair fixture covered only two stops. The concurrent
helper now chains the start gate as a ring (identical for two stops),
and NGSP9E runs three stops simultaneously, each in its own process:
all three land their host commits as exactly the new history, and the
registry reads afterwards. The case is green on this build, so the live
refusal comes from a condition the fixture does not have yet; the
root cause stays open until Glossover's stop-failure records are read.
No product change.

AI-Assisted: true
Dispatch: stage-0 (elephant)
