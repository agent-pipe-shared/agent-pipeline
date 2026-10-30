---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-stop-leaves-registry-drift-and-blocks-parallel-dispatch
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Elephant observation 2026-10-30, candidate 11 build (nine Goldfish dispatches)"
done_when: manual
---

# A Goldfish stop leaves registry drift and blocks parallel dispatch

## Evidence

1. After every Goldfish stop the native registry reads `native-goldfish:namespace-drift`. `routine-repair run heal`
   returns `SAR-HEAL-INCOMPLETE`; `routine-repair run move-aside` heals first and then refuses, so it loops. Only the
   direct `session-authority-repair.mjs move-aside --no-goldfish-running --reason ...` clears it, and only while no
   Goldfish runs.
2. The host commit of a held-patch return fails every time: `NATIVE-HOST-COMMIT-DIFF-CHECK` (trailing whitespace inside
   `.patch` files) and once `AGY-HOST-COMMIT-DRIFT`. The Elephant commits each return by hand.
3. D205 (parallel slices with disjoint write scopes) holds only sometimes: N20 R2 and N26-c2 were admitted together,
   but N27 next to a running N25 was refused `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD` although the write scopes
   (two slice files each) were disjoint.
4. The briefing generator still warns `DBG-CHECKPOINTED-OWNER` for a second same-item slice that D205 admits.

## Wanted

1. A Goldfish stop leaves no drift, or the routine heal clears it; `routine-repair run move-aside` never loops.
2. The host commit accepts a held-patch return (a `.patch` file is data; the diff check skips it or the patch is
   committed in a form the check accepts).
3. The integration-dependency hold honours D205: a running slice with a disjoint write scope does not hold a new one.
4. `DBG-CHECKPOINTED-OWNER` is not raised for a D205-admissible slice; `docs/parallel-work.md` states the D205 rule.
