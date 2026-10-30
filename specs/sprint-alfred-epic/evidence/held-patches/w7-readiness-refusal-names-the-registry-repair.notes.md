# Readiness refusal names the registry repair (W7, Elephant, D203)

Held patch `w7-readiness-refusal-names-the-registry-repair.patch`, built in a scratch clone at candidate 597b52b77. The PO applies it.

## Behaviour

- `native-goldfish-host-state.mjs`: new `readinessUnavailableRepair()`; the refusal for an unreadable session-authority registry now
  carries it as `repair`. The text names, in order: `session-authority-repair inspect` (which producer refuses), `routine-repair run heal`
  and inspect again, and, if a producer is still reconcile-refused and no Goldfish runs, `session-authority-repair move-aside
  --no-goldfish-running` (retained aside, nothing is deleted, the next dispatch initializes the registry fresh), then dispatch again.
- PO decision D203 (2026-10-30): the agent must be told to run move-aside when heal does not help.

## Evidence (scratch/agent-out/w7readyrepair, driver.mjs)

- Clone (patched): native-goldfish-host-state.test.mjs tests 62 pass 62 fail 0.
- Revert proof (production file at candidate, new assertions kept): 1 failing (NGHS44, the case carrying the new assertions); production
  restored byte-equal.
- Patch: 2 files, 16 insertions, 1 deletion; `git apply --check` on the plain candidate exit 0.
- Not run: Full Verify, Critic, Windows.
