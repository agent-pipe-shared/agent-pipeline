---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-1-2-13-blocks-managed-refresh
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Antigravity greenfield 0.7.0 report: installed agy 1.2.13 is refused by the source's exact 1.2.12 topology refresh checks; a stale managed copy remains loaded."
sprint: alfred
done_when: manual
---

# Allow the observed Antigravity 1.2.13 plugin lifecycle

The topology planner and refresh host both pinned the CLI to 1.2.12. The
observed host reports 1.2.13 and still exposes the plugin validate, install,
uninstall and list commands. The old 0.6.2 managed copy cannot be refreshed
to the current source through the documented global installer route.

## Acceptance

- Admit the observed 1.2.13 plugin lifecycle at both plan and apply boundaries
  while every release from 1.2.12 on is admitted per the PO decision of
  2026-10-14 (specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md).
- Preserve the physical source, import, registry, hook and installed-attestation
  readbacks before reporting success.
- Test 1.2.13 with a stale managed copy and an unknown version that remains
  blocked; confirm the three-runner manifest build after a fresh stamp.
- Re-run the actual Agy global update and first greenfield preflight on the
  newly installed local candidate. A fixture pass alone does not close this.

## Source progress

The shared version check and 1.2.13 regression are implemented. Refresh
13/13, topology integration 9/9 and installer 14/14 pass. Installed-host
acceptance on the next stamped candidate remains open.

## Triage

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `d1a015ff5`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Re-run the real Agy global update and first greenfield preflight on the newly installed local candidate
  The item states a fixture pass alone does not close it (source fix d1a015ff5; refresh 13/13, topology 9/9, installer 14/14 pass). It needs a stamped and installed candidate and the real agy 1.2.13 global update, which mutates the PO's real agy config and is not an agent action.
- **PO-SIGNATURE** — A fresh stamp for the three-runner manifest build is a PO call
  Stamping is an operator ceremony; D80 (2026-10-21) fixes the order: the full 0.7.0 scope first, then ONE candidate, and the Elephant does not stamp until the PO actively demands it (stamp, local greenfield tests, install, final release verify). Collect it into the 18:00 operator sitting list.
