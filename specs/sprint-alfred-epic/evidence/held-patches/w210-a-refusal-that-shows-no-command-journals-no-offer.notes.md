# w210: an external-operator route journals its offer only when it hands over a command (Direction 5 of the Windows latency plan)

Evidence: the first authority trace of a native Windows consumer (2026-11-04). One refused call took 144 s with 220 native observations while it held the registry lock. A refusal ran the full human-override planner, including plugin-identity hashing, and then journaled a hand-off offer, for a route that showed the human nothing to run.

## Decision

PO tile answer 2026-11-04: "Offer only on command" (Angebot nur bei Befehl). R-AC-08 asks that the offer exists BEFORE a command is handed over. A route without a command hands nothing over, so it needs no offer.

## Change

- `plugins/pipeline-core/lib/human-guard-override.mjs` (protected file, operator commit): `recordHumanGuardDenial` journals only when `routeHandsCommandToHuman(route)`, i.e. the route action carries a non-empty `command` or `copyCommand`. Every other external-operator route (sensitive input, a file outside the project, a read the adapter cannot attest) is returned at once with its `nextAction`. In practice only a non-secret Bash input that reaches `HGO-EXTERNAL-PROJECT-BOUNDARY` carries a command.
- Platform-neutral: the same code path on every platform.

## Tests

- `guard-handoff-offer.test.mjs` restated (QG-04, the logic is kept): the journaling cases use `echo hi > ../other/out.txt` (a redirect out of the project, the one Bash input that still reaches a command-carrying route) instead of the Read, Write and sensitive-input routes. New case: a route without a command returns its `nextAction`, journals nothing, writes no journal file, and is not refused when the journal is unavailable.

## Result in the work clone

guard-handoff-offer suite 11/11. Neighbouring guard suites: see w209 notes (one environment failure, identical on the base).

## Open

- Independent Critic review (guard and authority path).
- The Windows run after the 19d install should show the refusal time without the journaling and hashing share.
