# w319 — C23 references where needed (AC-108 closest criterion)

## What
- `design-course.md`: the exact Spec criterion shape (normative table row, `Journeys:` / `Asserts:` clauses with one example, the two tags) and an up-front rule to omit `--requested-route` / `--observed-identity` (`DRC-OBSERVATION-UNATTESTED`, identity recorded `unknown`).
- `antigravity-native-dispatch.md`: briefing goes as full verbatim text including the final newline; the `promptPointer` file reference is refused `DBG-REF-CARRIER` on Antigravity (read in `guard-dispatch.mjs`).
- `workflow-dispatch.md` (budget checkpoint section): `dispatch-budget-grant.mjs` is Claude-only; Codex route is checkpoint plus narrow continuation.
- `--help` branch (prints usage, exit 0, before any other work) in `rotate-handover-sections.mjs`, `repair-map.mjs`, `check-backlog-done-predicate.mjs`; all three added to `SCRIPTS_ANSWERING_HELP` (long flag only). None was on another list.
- `g23-read-help.test.mjs`: the hard-coded "script that really runs on help" was `rotate-handover-sections.mjs`, which now answers help; pointed at `pipeline-start-preflight.mjs` (on no list). Same assertions otherwise.

## Why
Greenfield agents read plugin sources for these facts; the references now say them where loaded.

## Not changed
- Item 2 (native takeover): `antigravity-native-dispatch.md` already states the Integration take-over (`agy-native-integrate.mjs plan|apply`, then host-commit recovery); nothing added. How a budget-bearing dispatch is admitted was not added: the budget guard is Claude-hook behaviour and was not read for this route.
- Codex continuation wording is taken from the briefing, not from a script (the grant script is blocked to dispatches).
- No agent or skill file under a Critic pin; PRD and Spec unchanged.

## Not proven
- The patch is cut against the integration clone base, so `apply --check` on the real HEAD fails on `command-catalogue.mjs` and `g23-read-help.test.mjs` context (expected; applies on the integration state).
- No Verify, no Critic run.
