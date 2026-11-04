# w214: the registry closure walk skips a registry.lock that vanished between its listing and its stat

Found in the first authority trace of the native Windows consumer (2026-11-04, plan section 2c): while a `guard-lifecycle-ready` process held the registry lock for 144 s, an `inspect` of the consumer first showed it as the live lock holder and then met a `registry.lock` that had vanished between the listing and the `lstat` (ENOENT). The inspection failed on a lock that nobody held any more.

## Change

`lib/session-authority-registry.mjs`: the stat of each entry the closure walk lists goes through the new exported `statListedRegistryEntry(repo, child, lstat = lstatSync)`. It returns `null` only when the entry is `agent-pipeline/session-authority/registry.lock` and the error is `ENOENT`; the walk skips that entry. Every other vanished entry and every other error is thrown as before: a registry that changes under the read stays a fault.

## Test

`native-goldfish-host-state.test.mjs`, case `D177-registry-lock-vanished-between-listing-and-stat`: a vanished lock gives `null`; a vanished catalogue entry and an `EACCES` on the lock are thrown; an existing lock is statted as before.

## Result in the work clone

native-goldfish-host-state D177 cases 8/8. Neighbour suites (lock wait, registry fsync, session-authority-repair): see the 19e rehearsal notes when run.

## Not covered

On Windows the walk then runs a native owner check of an existing lock (`owned(...)`); a lock that vanishes between the stat and that native check is not covered. Nothing was measured for it. The deterministic part is what the test pins.
