# Reader review phase one — greenfield-062-r1

Fresh blind read of the eleven public entry documents at reviewed commit
`3974a52525764b9db46461d441a255b7b470acc0`. The reader received no source,
history, diff, capability inventory, governance data, or prior discussion.

- **RR-P1-01 — Release status conflicts.** `README.md:14` and
  `docs/README.md:7` describe 0.6.2 as the next release and explicitly say no
  tag exists, while `docs/overview.md:9` and `docs/usage.md:170` call it the
  current release. Remove one of these incompatible status claims.
- **RR-P1-02 — Canonical reading order conflicts.** `README.md:10` and
  `README.md:73` give `README → SETUP → PIPELINE_FLOW`; `docs/README.md:3`
  gives `README → SETUP → usage → PIPELINE_FLOW`. Make the three references
  agree.
- **RR-P1-03 — README enters internal architecture too early.** `README.md:82`
  moves into Public Core, Private Overlay, and runtime roots before the simple
  flow at `README.md:120`. Move the flow and end-to-end journey before “Three
  roots”.
- **RR-P1-04 — Maintainer reference is overweighted.** `README.md:213-332`
  and its German counterpart from `README.md:581` occupy almost one third of
  the entry page. Move the source-maintainer command block and internal
  capability summary into maintainer reference documentation.
- **RR-P1-05 — SETUP steps are out of execution order.** `SETUP.md:101` asks
  for `pipeline-start` before the plugin is bound at `SETUP.md:142` or
  `SETUP.md:174`. Put runner binding before classification.
- **RR-P1-06 — SETUP top-level order starts with B.** Routine adoption is “B”
  at `SETUP.md:40`, rare maintainer work is “A” at `SETUP.md:343`, and “C”
  follows at `SETUP.md:423`. Renumber by reader and execution order and put
  maintainer work last.
- **RR-P1-07 — Optional specialist paths interrupt routine adoption.** Private
  Overlay and Git lifecycle at `SETUP.md:202-250` sit between plugin binding
  and project calibration. Move both after the complete routine path into an
  advanced section.
- **RR-P1-08 — A Claude-specific action appears as general.** `SETUP.md:306`
  says “Open the project in Claude Code” inside a guide covering three
  runners. Move it into the Claude subsection.
- **RR-P1-09 — Source configuration interrupts the lifecycle guide.**
  `PIPELINE_FLOW.md:221-245` and the German counterpart from line 487 are
  maintainer setup inside a lifecycle guide. Remove them here and point to the
  source-maintainer setup in `SETUP.md`.
- **RR-P1-10 — The German reference translation adds content.** “Unified close
  coordinator (H5)” at `PIPELINE_FLOW.md:513-521` has no counterpart before
  the English authority boundary at line 276. Remove it or add the matching
  English content at the close section.
- **RR-P1-11 — Cost reference opens with internal optimization.**
  `docs/cost-and-measurement.md:5` starts with lane eviction before the more
  useful full-Verify timings at line 11. Put the full-Verify table first.
- **RR-P1-12 — Parallel-work explains mechanics before the decision.**
  `docs/parallel-work.md:7` begins with runner events; the user decision appears
  only at line 21. Move “When parallel work helps” before “Native runner
  surfaces”.
- **RR-P1-13 — Usage journey is interrupted by policy and host internals.** The
  optional approval mode at `docs/usage.md:71` precedes normal delivery at
  line 104; export-consent and host-API detail then dominates lines 131-168.
  Complete the normal delivery journey first, put approval policy afterward,
  and move host/consent detail into reference documentation.

No findings: `docs/audit-and-evidence.md`, `docs/enforcement.md`, and
`docs/security-controls.md`.
