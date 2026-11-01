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

## Triage 2026-11-01 (candidate 15c)

Root cause measured (read-only, retained diagnostics): of 290 retired pending states only 2 carry a terminal record; 193 dispatches left a stop-failure. From 2026-10-30 the dominant
code is `NATIVE-HOST-COMMIT-DIFF-CHECK` (`git diff --cached --check` in `lib/agy-host-commit-execution.mjs` reads every blank context line of a held `.patch` as trailing whitespace). No host
commit means no terminal record, so the registry member stays `armed`; the Elephant's hand commit does not release it; `heal` then moves the settled pending files and the native-goldfish
namespace drifts under that member, which the registry refuses strictly (PF-55). Other endings leave a member armed too (plain-text stop, `checkpoint` hand-back, cancel).

- Wanted 2 is held: `w22` (the check skips `*.patch` and `*.diff`; two cases pin both sides).
- Wanted 1 is held as an interim: `w24` (heal finishes with the retained-aside move-aside when nothing is open or kept) and the `move-aside` kind no longer stops on an incomplete heal (it looped).
  The structural gap remains: no per-member abandon transition for a settled slice, so the registry is discarded wholesale.
- Wanted 4 is held: `w27` (the generator no longer warns `DBG-CHECKPOINTED-OWNER` for a started slice whose recorded write scope is disjoint from the new one; an overlapping or unknown scope keeps it; `docs/parallel-work.md` states the D205 rule).
- Wanted 3 (the integration-dependency hold) is not reproduced from the code, so nothing is built on it. Measured 2026-11-01: `orderAndCoverAdmittedSlice` (`lib/native-goldfish-host-state.mjs`) adds a `dependsOn` only when `scopesOverlap` finds an overlap with another live slice, and `scopesOverlap` reports two disjoint file lists in one directory as disjoint (a directory entry or a glob does overlap). The hold therefore comes from a real overlap in the stored queue rows, from an explicit `dependsOn` written into the queue, or from a slice that depends on one that is not integrated. Needed to go on: the queue rows (`slice-queue.json` slices with id, writeScope and dependsOn) of the N27-next-to-N25 case and the refusal reason text, which names the held slice.
