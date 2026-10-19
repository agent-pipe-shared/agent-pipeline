---
schema: pipeline.backlog-item.v1
id: pipeline.session-authority-repair-gaps-after-pf55
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PF-55 / D52 Tier 1 build on this repository (2026-10-19); measured gaps the build does not close"
sprint: none
done_when: manual
---

# Session-authority repair: gaps left after PF-55

## Description

PF-55 and D52 Tier 1 give every `SDC-*` refusal a command the agent session or the PO's
terminal can run (`scripts/session-authority-repair.mjs inspect`, `heal`, `move-aside`;
Elephant decision E36). Four gaps remain, measured during the build:

1. **A native pending file changed outside the registry.** The native producer's reconcile
   throws `native-authority-member-drift` rather than reporting a drift, so the D51 heal skips
   it and the strict refusal holds. `move-aside` followed by a dispatch in the same process
   still fails with `native-authority-pending-drift`, because the in-process owner cache keeps
   the old digest. Hook processes start fresh, so the real route may recover, but no test
   proves it. Needed: a fresh-process test, and if it still fails, a repair that also retains
   the changed native state of a settled slice.
2. **The continuity cleanup slot (D52 Tier 2).** `session-cleanup.mjs start` is the only
   creator of the cleanup binding, and `CS-SESSION-CLEANUP-TOO-LATE` / `-PROTECTED`
   (`lib/continuity-state.mjs`) refuse any binding once a dispatch, decision transaction or
   close transition exists. A running session cannot take this slot over. Check list for the
   change: `continuity-state.mjs` (the too-late and protected checks), the bind and
   compare-and-swap rules in `onboarding-continuity.mjs`, the bound branch of
   `session-cleanup.mjs start`, the PF-50 exclusion of hook descriptors, and a usable owner
   liveness for hook descriptors (today `ownerRuntime: null`). It lifts a safety gate, so it
   needs a PO decision first.
3. **AGY reservations in the repair report.** `inspect` lists native item reservations only.
   AGY reservations follow the same settled rule (E36 (a)), but the report does not name them.
4. **The PO's terminal cannot bind late.** D52 (1) late binding uses the session's own
   `CLAUDE_CODE_SESSION_ID`. A plain terminal has none, so terminal-only writes that need a
   bound owner (other slice-queue mutations of a governed queue) stay refused there. Cancel
   and every repair verb need no owner, so nothing is fully blocked.

## Acceptance

- Gap 1: a fresh-process test proves that `cancel --started` followed by `move-aside`
  lets the next dispatch run, or the repair retains the changed native state.
- Gap 2: a PO decision, then a take-over route with tests.
- Gap 3: `inspect` names AGY reservations with their settled state.
- Gap 4: documented, or a terminal-side owner route decided by the PO.
