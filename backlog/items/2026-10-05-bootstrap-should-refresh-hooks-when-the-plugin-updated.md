---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-should-refresh-hooks-when-the-plugin-updated
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "PO statement 2026-10-05 (Alfred session), deferred from round 3 of the signed bundle commit 866be2139."
sprint: alfred
done_when: manual
---

# Bootstrap should refresh hooks when the plugin updated

## Description

The PO's position (verbatim, German): "das installieren der hooks sollte aber
eigentlich der agent im bootstrap machen wenn es updates gibt". In English:
installing the hooks should be done by the agent during bootstrap whenever
there are updates, not by the PO. There is also no agent-operable install
route overall.

## Proposal

- Bootstrap detects that the plugin updated and refreshes the installed hooks
  itself.
- Provide an agent-operable install route overall.

## Recurrence 2026-10-08 (late) — the enforcement layer let it be skipped

After installing candidate `0.7.0+claude.20261008194106.da20519d`, the start preflight reported all three hooks
`installed-but-stale` / `refresh` with typed `installCommand`s, yet `mandatoryHookReadiness.status` was `ready` and
`nextAction` pointed only at the onboarding inspect. The Elephant printed the bootstrap confirmation and dispatched ~15
Goldfish without refreshing; the PO caught it ("hättest du nicht die hooks nach dem bootstrap updaten müssen … und dann
direkt wieder an die durchsetzungsschicht denken, denn scheinbar sind diese dinge von dir ignoriert worden und das wird
der nächste vllt auch machen"). The same session skipped the optional model-role bootstrap on the strength of a backlog
item instead of running it; run later, it returned `MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE` (`fallback: legacy-v3`), so a
new model family is never detected on native Windows
(`2026-10-08-model-role-bootstrap-is-always-unavailable-on-native-windows.md`).

Sharpened proposal (enforcement, not advice; PO decision BJ: a strong preflight, one simple run):
1. A stale or missing mandatory hook makes the preflight non-ready for the Elephant: `nextAction` is the exact refresh
   action (all stale hooks in one call), and the bootstrap confirmation line is refused until the readback is current.
   Goldfish/Critic stay unaffected (they never install).
2. The preflight runs the model-role bootstrap itself and returns its result as a required readback field; the
   confirmation line must carry it (`unavailable` is a legal value, an absent field is not).
3. One pin per point: stale hook → non-ready with the refresh action; model-role field present in every ready envelope.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — Real hook apply on native Windows is refused with PB-WINDOWS-ASSURANCE; the Windows branch of P3 needs a native run
  Run the item's pin under lib/pins/ natively through cmd.exe with Windows node on a --no-hardlinks clone under /mnt/d, expecting the typed PB-WINDOWS-ASSURANCE refusal and the stale-hook non-ready envelope with the exact refresh action; small file, minutes not hours. A real hook apply into the PO's actual Windows settings is not needed and not an agent action.
