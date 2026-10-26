---
schema: pipeline.backlog-item.v1
id: pipeline.missing-docs-adr-directory-blocks-implementation-entry
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, finding D8): set-phase implementation refused with ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED (ARCH-DECISION-SOURCE-UNAVAILABLE) in a project without ADRs"
done_when: manual
---

# A project without `docs/adr/` cannot enter implementation

## Evidence

After a green fitness gate, `set-phase implementation` failed with `ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED`
(`ARCH-DECISION-SOURCE-UNAVAILABLE`). `architecture-effective-decisions.mjs:85-91` blocks when `docs/adr` is not a
directory; an existing project without ADRs does not have one. Neither the preflight orientation nor the adoption
mention it, and the message names no path.

## Workaround

An empty `docs/adr/` with `.gitkeep` (a `.md`/`.json` file would be read as an ADR candidate).

## Wanted

- A missing `docs/adr/` means "no decisions" and is ready; or the refusal names the path and "create `docs/adr/`" as the
  repair, and the preflight/adoption surfaces the hurdle before the plan signature (see D4 in
  `pipeline.brownfield-architecture-gate-never-passes`).
- Regression: project without `docs/adr/` passes the applicability check; an unreadable `docs/adr` (file, not directory)
  still refuses with the path.
