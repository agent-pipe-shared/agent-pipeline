---
schema: pipeline.backlog-item.v1
id: pipeline.plugin-update-under-an-onboarded-project-derails-the-next-session-into-repair
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
source: "Windows Claude Code greenfield happy-path run, 2026-08-27 (D--Dev-Rune-Test1-Claude-060-70). PO report: the session 'ran into a repair unnecessarily'. Transcript read directly."
done_when: contains plugins/pipeline-core/lib/project-onboarding-v3.mjs plugin was updated
---

# A plugin-source update under an already-onboarded project turns the next session into a two-step repair

## What was measured

The Windows greenfield run reached `GUARD-LIFECYCLE-NOT-READY: projection-drift`
and was routed into a repair chain. The PO experienced this as an unnecessary
detour in what was supposed to be a happy-path test.

Traced to `lib/project-onboarding-v3.mjs` (the runtime branch around the
`planRunnerProfileMigrationV3` call): `projection-drift` is emitted when the
runtime plan reports `ready` — which per `runner-profile-migration-v3.mjs:667`
means `changes.length !== 0` — while no runtime target is absent. In other words:
every runtime file exists, and at least one of them differs from what the
CURRENT plugin source would generate. The diagnostic says exactly that
("generated runtime bytes differ from the V3 projection").

**The branch is correct.** An earlier reading of it as a logic defect (treating
"nothing missing" as drift regardless of content) was checked and disproved:
`noop` is the distinct status for a projection that already matches, so reaching
this branch with `ready` really does mean the bytes differ.

## Why it fired, and why that is the actual finding

The project was onboarded against one plugin candidate, and the marketplace copy
was then updated — repeatedly, that evening, as candidates were being iterated
and rsynced. The generated runtime files legitimately no longer match what the
newer source renders, so the drift is real and the repair is the correct
response.

The finding is therefore not "the guard is wrong". It is that **an ordinary,
expected event — updating the Pipeline plugin — silently converts every
already-onboarded project into a repair-required state**, and the affected
session discovers this only by being refused mid-work. For the Pipeline's own
test projects that means a greenfield happy-path run cannot be evaluated at all
once a candidate has been swapped underneath it; the run measures the repair
path instead of the path under test.

Two further costs observed in the same transcript: the repair guidance correctly
distinguishes a language/profile mismatch from projection drift and states they
need *different* tools — which is a two-step manual chain — and the repair
commands appear in the transcript only as displayed text; neither was executed
before the session ended.

## Proposal

Not designed here. Candidate directions, in rough order of value:

1. **Self-heal instead of refuse.** A projection whose only difference is "the
   source moved forward" is regenerable without a decision — the bytes are a
   pure function of the source. Consider making this an automatic, announced
   regeneration on bootstrap, the way orphan scratch descriptors are already
   retired automatically, rather than a refusal with a manual two-step chain.
2. **Say what actually changed.** The diagnostic states that bytes differ but
   not which target, nor that the likely cause is a plugin update. A session
   told "the plugin was updated since this project was onboarded" would not
   read it as an unexplained failure.
3. **Test discipline.** Independently of the fix: a greenfield happy-path run is
   only meaningful against a plugin version that does not change under it. Worth
   stating in the runner-test procedure.

## Acceptance

- Updating the plugin under an onboarded project either self-heals on the next
  bootstrap, or produces a refusal that names the cause and offers one action.
- A greenfield test run is not silently converted into a repair-path run.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** The guard is correct and stays correct — what is accepted here
  is that an ordinary, expected event (updating the plugin) silently converts
  every already-onboarded project into a repair-required state, discovered only
  by being refused mid-work. It has already cost real measurement: one of the
  three runner happy-path runs measured the repair path instead of the path
  under test. Proposal 1 (announced self-heal, since the bytes are a pure
  function of the source) and proposal 2 (name the cause in the diagnostic) are
  both accepted in principle; which one lands is a design call for the
  implementing window, not settled here.
- **Assignment (if accepted):** Sprint Nightwing — ADR-0043's scope statement
  for that window is "onboarding, configuration, documentation and low-friction
  adoption", which is this item almost word for word. Not Alfred: closed to new
  scope (PO, 2026-08-28).
  **Proposal 3 (test discipline) is split off and needs no window:** it is a
  procedure note, costs nothing, and is already being applied by hand — a
  greenfield happy-path run is only meaningful against a plugin version that
  does not change under it. It should be written into the runner-test procedure
  by whichever session next touches it, independently of this item's fix.
- **Date:** 2026-08-28
