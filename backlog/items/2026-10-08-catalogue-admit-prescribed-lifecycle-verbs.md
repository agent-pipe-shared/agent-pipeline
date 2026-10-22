---
schema: pipeline.backlog-item.v1
id: pipeline.catalogue-admit-prescribed-lifecycle-verbs
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-10-08
closed_at: 2026-10-22
closure_repository: self
closure_commit: 35455319327d44d5519671a13f0956583dd99a21
closure_evidence: backlog/items/2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

**Rejected as a duplicate (backlog grooming 2026-10-22):** merged into `backlog/items/2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md`. Both ask that every command the Pipeline itself prescribes in a lifecycle phase (present-plan, continuity-cas, integrate-final, design-course-session, route selection, receipt producers) is admitted by the dev-plan/lifecycle guard instead of being refused as opaque-script-execution, so the PO needs no override; one catalogue/admission change plus the zero-override end-to-end test closes both. The canonical is the older and broader item (table of 10 cases, acceptance list, 2026-10-18/20 observations). All content of this item is carried over verbatim into that item's section "Merged from `2026-10-08-catalogue-admit-prescribed-lifecycle-verbs`"; nothing is lost.

# Catalogue-admit prescribed lifecycle verbs

## Description

Admin-step inventory row C12 (hand-run lifecycle verbs refused to the agent: `present-plan`,
`design-course-session --run-v2`, continuity writes, run via `!`; per design course, PO terminal) is classified
automatable: catalogue-admit every verb the course prescribes. Source: `docs/admin-steps-inventory.md` row C12,
candidate 4; toil log:27, :29, :30 (T21, T23, T24).

## Triggering situation

Toil rows T21/T23/T24 (toil log:27, :29, :30): the design course prescribes verbs that the agent is then refused,
so the PO runs them by hand.

## Affected artifact

The command catalogue / guard admission in `plugins/pipeline-core` and the design-course lifecycle verbs.

## Proposal

Every verb the course prescribes runs for the agent in the state where it is prescribed.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08

## Observed 2026-10-20: Codex WSL greenfield, second run (blocker)

Source: PO-supplied forensic analysis of a Codex greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_codex2_20261020.md`), installed `pipeline-core`
`0.7.0+codex.20261020064459.a8ddf85`, chat approval mode. The run never reached the first
implementation dispatch. The PO puts the report's blockers and majors into the next candidate (D64).

- Prescribed preparation before implementation was refused as opaque execution, so the PO had to
  grant four chat one-time overrides: the route selection `model-role-dispatch-select.mjs`, the
  initial and the final design-review receipt producer, and the delta receipt (the last one still
  unanswered at the stop). The architecture baseline diagnosis, `pipeline-state.mjs --help` and the
  optional model-role bootstrap readback (`GUARD-DEVPLAN-SHELL`) were refused the same way, and
  `approve-plan` rendered with an absolute node executable was refused while the plain `node`
  spelling passed.

Added acceptance (0.7.0, blocker, D64):

- Every fixed installed entry point that the Pipeline prescribes before the first implementation
  dispatch (route selection, design-review receipt production, architecture materialization and
  baseline diagnosis, feature-package registration, the help and readback forms it documents) is
  admitted in the lifecycle state that prescribes it, in the closed argument forms it documents and
  in the spelling its own next-action rendering emits, absolute node path included.
- One integration test runs with the real guards from a fresh repository to the first
  implementation dispatch (route selection, review receipt, architecture materialization,
  registration) and needs zero human guard overrides.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — D64: admit route selection, design-review receipt production, architecture materialization and baseline diagnosis, registration and the documented help/readback forms in their prescribing state, absolute node path included
  Item is closed as a duplicate (2026-10-22) of 2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md. The pin catalogue-admit-prescribed-lifecycle-verbs.test.mjs already has D64 cases for help/readback forms, route selection, receipt production, feature-package registration and architecture baseline diagnosis (lines 378-504); I did not verify the absolute-node-path spelling case and the canonical item carries the remainder.
- **LINUX-RUN** — D64: one integration test with the real guards from a fresh repository to the first implementation dispatch needing zero human overrides
  The pin has no fresh-repository end-to-end case (only per-verb admission cases). An agent can author and run it on Linux with node/git via node scratch/run-in.mjs <clone> <label> <test-file>; closes when route selection, review receipt, architecture materialization and registration all pass the real guards with zero overrides. Tracked in the canonical merged item.
- **NOT-BLOCKED** — The receipt-alias symlink case in the pin is a skipped stub; it needs a real case on a Linux run
  The pin has a real case 'AC-123 receipt aliases (directory/file symlink) never gain present-plan admission' (line 326) that creates real symlinks and skips only when the host cannot create a link (native Windows); on this Linux/WSL machine it runs for real.
- **HOST-SESSION-NEEDED** — Re-run the Codex WSL greenfield on an installed candidate
  Needs the PO-stamped candidate installed and a real Codex/WSL greenfield session with authenticated model turns (chat approval mode); observed is reaching the first implementation dispatch with no chat overrides.
