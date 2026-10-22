---
schema: pipeline.backlog-item.v1
id: pipeline.codex-bootstrap-in-the-typed-next-action
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-10-08
closed_at: 2026-10-22
closure_repository: self
closure_commit: d1a24c6a6da46232b493138b11d777c42aa1220e
closure_evidence: plugins/pipeline-core/lib/pins/codex-bootstrap-in-the-typed-next-action.test.mjs
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Codex bootstrap in the typed next action

## Description

The admin-step inventory row "Run Codex design-readiness bootstrap script on a fresh host" (per host, PO terminal) is
marked automatable: fold it into the bootstrap typed next action for a fresh host. The inventory marks the premise
unverified: the row has no toil row and cites only the existing script
(`plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs`), so the manual step itself is not evidenced
as recurring toil. Source: `docs/admin-steps-inventory.md` Codex row (line 54), candidate 6.

## Triggering situation

None measured: no toil row exists for this step. The premise (that a PO hand-runs this script on fresh hosts) needs
verification before work starts.

## Affected artifact

`plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs` and the bootstrap typed next action.

## Proposal

After verifying the premise, include the design-readiness bootstrap in the fresh-host typed action.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** needs-verification (2026-10-08); premise refuted on verification (2026-10-22); closed as obsolete (refuted premise, retired route) on 2026-10-22.
- **Rationale:** decision AO: automatable admin step. On verification the premise does not hold (see "Verification of the premise"): the script is a per-design-package producer, not a host setup step, and ADR-0085 retired it. Closure evidence is the pin that records both grounds; the closure commit is the one that retargeted that pin (`d1a24c6a6`).
- **Assignment (if accepted):** none; closed. The stale inventory entries were corrected the same day: `docs/admin-steps-inventory.md` row 54 is marked retired and uncounted (Codex count 4 to 3) and candidate 6 is withdrawn.
- **Date:** 2026-10-08 (opened), 2026-10-22 (closed)

## Verification of the premise (agent, 2026-10-22)

Premise refuted on two independent grounds, pinned in `plugins/pipeline-core/lib/pins/codex-bootstrap-in-the-typed-next-action.test.mjs`:

1. The script is not a host setup step. `codex-design-readiness-bootstrap.mjs` is a per-design-package readiness producer: its
   usage needs `--repo-root`, `--dispatch-id`, `--queue-revision`, `--session-id`, `--expected-descriptor-sha256`, `--receipt`,
   five `--source` entries and an advisor preparation. A fresh host has none of these, so there is no fresh-host action to fold it into.
2. ADR-0085 retired the design course behaviorally. `runCodexDesignReadinessBootstrap` returns `DESIGN-COURSE-RETIRED` before
   parsing, state access, dispatch or publication, and `runDesignCourseV2` returns the same retirement. Nothing runs, so nothing
   needs automating.

The deferral pin is retargeted to this state (it still fails if the preflight starts naming the script). Recommended disposition for the
Elephant triage: close as obsolete (premise refuted, route retired). The inventory row `docs/admin-steps-inventory.md` line 54 and
candidate 6 described the step as automatable and were stale; they were corrected at triage on 2026-10-22 (the inventory carries row counts, adjusted accordingly).

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Decide whether the recurring-toil premise is verified or the item is deferred to the post-0.7.0 automation lane
  Premise refuted by the agent on 2026-10-22 (pin codex-bootstrap-in-the-typed-next-action.test.mjs): the script is a per-design-package producer, not a host setup step, and ADR-0085 returns DESIGN-COURSE-RETIRED before it does anything. Recommended disposition is close as obsolete; this is an Elephant triage entry, not a PO question.
