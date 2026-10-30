# D203 move-aside after an unsuccessful heal, wired into heal (W7, Elephant)

Held patch `w7-d203-move-aside-after-an-unsuccessful-heal.patch`, built in a scratch clone at candidate d901a2ab1 PLUS the held patch
`w7-settled-pending-keys-siblings-by-content-digest` (stacked: apply that one first). The PO applies it.

## Behaviour (PO decision D203, 2026-10-30)

- `routine-repair run move-aside`: when the only findings besides the two named ones are producers that are `reconcile-refused`, the
  routine runs `session-authority-repair heal` first and inspects again. Nothing left: it ends as `healed`. Still only reconcile-refused
  producers (or the named findings): it runs `session-authority-repair move-aside --no-goldfish-running` (registry retained aside,
  nothing deleted). Any other finding (a held lock, an open reservation, a drifted producer, an unreadable registry) is still refused.
  The result carries `healedFirst: true`.
- `routine-repair run heal` (the mandatory path): after its delegate it inspects again; a producer still `reconcile-refused` is listed in
  `stillReconcileRefused` and `next` names the move-aside routine with `--no-goldfish-running` and "only when no Goldfish runs".
- The `--no-goldfish-running` attestation stays the agent's; the routine does not judge liveness.

## Evidence (scratch/agent-out/w7moveaside, driver.mjs)

- Clone (patched): routine-repair.test.mjs 28/28; dispatch-briefing.test.mjs 116/116.
- Revert proof (production file at candidate + pendfix, new tests kept): 5 failing (heal table row, two D203 move-aside rows, the heal
  next-step case, the heal order case); production restored byte-equal.
- `git apply --check` on candidate + pendfix exit 0.
- Not run: Full Verify, Critic, a real reconcile-refused registry, Windows.
