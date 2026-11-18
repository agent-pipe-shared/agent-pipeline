fix(host-state): a pending state retires at its own integration and heal proves nothing is in flight

The retained-aside snapshot reader keeps the readiness gate and heal derives, fail-closed, that nothing is in flight.

AI-Assisted: true
Dispatch: C30J-J4 (goldfish)
