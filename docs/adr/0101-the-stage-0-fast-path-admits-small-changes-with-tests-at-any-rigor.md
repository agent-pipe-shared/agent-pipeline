# ADR-0101: the stage-0 fast path admits small changes with tests, at any rigor

> Agent-Pipeline · Sprint Alfred · 2026-11-14

**Status:** accepted (2026-11-14, PO tile G-T1 round 3, "Medium + tests", register D253). Built in candidate 29e. Not yet used on a consumer repository.

**Context source (PO, 2026-11-14):** the PO asked whether an Elephant should be allowed to do more directly, tests and more lines included, and asked for the cost of a Goldfish against a direct fix. Measured on a consumer session: a Goldfish run for a small fix cost 53,061 to 109,756 tokens, 21 to 44 tool calls and 70 to 290 s of agent time, plus about 10 to 15 Elephant calls and 10 to 25 minutes around it; the same pin fix done directly took about 4 calls and 2 to 3 minutes. The PO chose the recommended option "Medium + tests".

## Context

EL-01 (`roles/elephant.md`) lets an interactive Elephant session make a fix itself only on the stage-0 fast path: at most 2 files, at most about 25 diff lines, rigor 0, no test change, and none of a list of surfaces. Everything else is a Goldfish dispatch. In practice the narrow path sent one-line pin repairs and test updates after a recovered dispatch to a full Goldfish round. The roles text also called the same path "Tier-0" in two places without defining that word, and consumers asked what Tier-0 meant.

## Decision

1. **The stage-0 fast path, new criteria.** An interactive Elephant session MAY make a change itself, at any rigor level, when ALL of these hold:
   - at most 3 files and at most 60 changed lines (additions plus deletions over the whole commit);
   - one concern;
   - at most 25 of those changed lines are production logic (code files that are not tests);
   - no new public API, schema, dependency or security surface, and no architecture or guardrail-hook-CI change;
   - tests and pins may be changed or added, except a test that checks the Elephant's own new logic from the same change (that test still comes from a Goldfish or an independent author);
   - trivially `git revert`-able, and no risk flag set.
2. **Evidence.** The affected tests are green before the commit; `verify` and the evidence artifact stay mandatory. The commit carries the trailer `Dispatch: stage-0 (elephant)` (`agent-obligations.md` §6). A Critic run is still required only when the risk flag is set; the fast path adds no Critic round of its own.
3. **Above any criterion it is a Goldfish dispatch.** The path is not extended by local judgment.
4. **One name.** "Tier-0" is retired; the name is "stage-0 fast path" everywhere.
5. **What the checks enforce.**
   - `harness/scripts/check-dispatch-provenance.mjs` checks the mechanical caps per commit: at most 3 files, at most 60 changed lines, and at most 25 changed lines in code files that are not tests (`.test.`, `pins/`, `.fixture.` paths). The semantic criteria stay self-declared, as before.
   - The guard maintenance window's `elephant-direct` authorship accepts the new file and line caps (3/60). It still refuses `touchesTestFile: true`: a window lifts the protected-test-path guard, and the window cannot tell an ordinary test from a test that checks the Elephant's own change. Old stored records stay valid, because the caps only loosen.
   - `guard-el01-tripwire.mjs` is unchanged in behaviour: a high risk class still blocks Elephant writes. Its refusal text no longer names rigor 0.
   - The coarse bound of `dispatch-authorship-verify.mjs` (10 paths) is unchanged.
6. **Unchanged.** The risk-flag clause, the guardrail-hook-CI and architecture exclusions, the GMW clarification in EL-01, the host-commit recovery clarification, and administrative role work.

## Consequences

- A pin repair, a test update after a recovered dispatch, or a small fix with its test change no longer needs a Goldfish round when it stays inside the caps.
- The Critic text that says a stage-0 commit touching no production path is not a finding is part of the one approved Critic template re-pin (candidate 29e, T5 and T1), not of this change; `roles/critic.md`, `agents/critic.md` and both `critic-review.md` copies change only there.
- Not covered: a mechanical check that a changed test does not check the Elephant's own new logic; that stays self-declared and is a Critic question.
