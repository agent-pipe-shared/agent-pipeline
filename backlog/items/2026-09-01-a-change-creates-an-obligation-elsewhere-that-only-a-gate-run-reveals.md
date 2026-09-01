---
schema: pipeline.backlog-item.v1
id: pipeline.a-change-creates-an-obligation-elsewhere-that-only-a-gate-run-reveals
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "scratch/release-flow-self-invalidation-2026-09-01.md (loop 4)."
---

# A change creates an obligation elsewhere that only a gate run reveals

## The pattern

A change at point A silently creates an obligation at point B, and today the
only thing that surfaces the omission is a full gate run. Four instances
measured on 2026-09-01, each costing a full ~13-minute `verify.mjs` run to
surface a one-line omission:

- the vendored canon copy, after a `guardrails/`/`templates/` edit;
- `DYNAMIC_IMPORT_EDGES` in the kernel-closure test, after a new dynamic
  import;
- the observation-governance documentation inventory, after a new ADR;
- the reference-path `ALLOWLIST`, after untracking a file an entry pointed
  at.

## Direction

The checkers that find this class of omission — vendored-canon generation,
reference paths, ADR classification, kernel edges, doc contracts, suite
registration — all run in seconds on their own. Placing them behind 505
suites is the waste: a fast pre-gate running only those checks after every
commit turns thirteen minutes of gate time into roughly eight seconds; the
expensive suites still run once, at the end, rather than being the mechanism
that first reveals a one-line omission.

## Note

This item is the general pattern behind the four instances above. A prior
handover recorded the same shape as unfiled.
