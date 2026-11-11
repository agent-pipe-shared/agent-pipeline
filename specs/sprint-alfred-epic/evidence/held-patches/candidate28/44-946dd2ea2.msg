test(verify): register the recursive delete and Git author suites

- hooks/recursive-delete-policy.test.mjs (8 cases) and
  lib/held-git-author.test.mjs (5 cases) landed in candidate 28 without a
  Verify entry; the registration check reported both as UNREGISTERED in the
  apply rehearsal, which would make a Full Verify red.
- Adds both to the static suite list and their surfaces to the
  deterministic-verification capability of the inventory.

AI-Assisted: true
Dispatch: stage-0 (elephant)
