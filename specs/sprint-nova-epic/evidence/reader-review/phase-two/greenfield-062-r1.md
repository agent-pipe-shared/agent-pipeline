# Reader review phase two — greenfield-062-r1

Fresh weighting review of the eleven public entry documents at reviewed commit
`3974a52525764b9db46461d441a255b7b470acc0`, the immutable phase-one report,
the capability inventory, documentation governance, and the reader-review
protocol. The reader received no source, diff, history, or conversation.

## P0

- **RR-P1-01 confirmed and expanded.** `README.md:14-16` and
  `docs/README.md:5-7` say “next release / not a tag”, while
  `docs/overview.md:7-10`, `docs/usage.md:170`, and
  `PIPELINE_FLOW.md:257-258,531-532` say “current release”. Keep one release
  status and align or cut every conflicting claim.
- **RR-P1-05 confirmed.** `SETUP.md:101` is numbered before runner binding at
  lines 142 and 174 even though lines 103-107 themselves require binding
  first. Put binding and host restart before classification.
- **RR-P1-08 confirmed.** `SETUP.md:306-318` is numbered as a general step but
  requires Claude Code. Move it into the Claude branch or make it genuinely
  runner-neutral.

## P1

- **RR-P1-02 confirmed and expanded by RR-P2-02.** `README.md:10-12,73-80`
  and `SETUP.md:12-14` go directly from SETUP to PIPELINE_FLOW, while
  `docs/README.md:3-13` declares `SETUP → usage → PIPELINE_FLOW`. Choose one
  order and align all four references.
- **RR-P1-03 confirmed.** Move the flow and end-to-end journey before the
  internal “Three roots” material at `README.md:84-118`.
- **RR-P1-06 confirmed.** Renumber SETUP's B/A/C top-level sequence by reader
  order: routine adoption, existing-repository adoption, then maintainer work.
- **RR-P1-09 confirmed.** Cut source-migration commands from both language
  halves of `PIPELINE_FLOW.md:221-245,487-511` and link the maintainer path in
  SETUP.
- **RR-P1-10 confirmed.** Cut the English-only “Unified close coordinator”
  content embedded in the German reference half at `PIPELINE_FLOW.md:513-521`.
- **RR-P1-13 confirmed and expanded by RR-P2-01.** Complete the normal
  delivery journey in `docs/usage.md` before approval policy. Move the detailed
  export-consent/native-host API material at lines 131-168 from this
  compatibility redirect into a maintained public-user reference.

## P2

- **RR-P1-04 partially confirmed.** Remove the source-maintainer command block
  at `README.md:213-243` and its German mirror. Retain the compact capability
  grouping and anchors at lines 245-332 because the inventory binds active
  capabilities there.
- **RR-P1-07 partially confirmed.** Move Private Overlay at
  `SETUP.md:202-231` after the routine path. Retain the Git lifecycle in the
  routine flow because repository mode and the initial-commit boundary are
  relevant before delivery.
- **RR-P1-11 confirmed.** Put full-Verify envelopes before the lane-eviction
  history in `docs/cost-and-measurement.md`.
- **RR-P1-12 confirmed.** Put “When parallel work helps” before “Native runner
  surfaces” in `docs/parallel-work.md`.

Phase one's no-finding result is confirmed for `docs/audit-and-evidence.md`,
`docs/enforcement.md`, and `docs/security-controls.md`.
