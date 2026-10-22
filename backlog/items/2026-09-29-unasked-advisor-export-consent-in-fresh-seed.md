---
schema: pipeline.backlog-item.v1
id: pipeline.unasked-advisor-export-consent-in-fresh-seed
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review M2: fresh pipeline.user.yaml set advisor_export.consent to approved before the PO answered an export question."
sprint: alfred
done_when: manual
---

# Require the PO's explicit Advisor-export choice

Seed declined and treat a missing field as disabled. Ask approved/declined in
the existing bundled first-answer round, bind the answer atomically to source,
private receipt and replay checks, and prevent an Advisor export before an
approved answer. The frozen Critic export allowlist remains a technical upper
bound; its separate native export consent still applies. The lifecycle guard
must admit the exact generated first-answer command in every state where the
driver publishes it, while refusing trust-anchor flags combined with that
answer. Test every runner.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — The pin drives the real driver with runner stubs; an installed-host first-answer round on each runner is not shown
  Needs a fresh seed in a real Claude, Codex and Antigravity session where the PO answers the bundled first-answer round; observed: advisor_export.consent starts declined and flips to approved only after the PO's answer. Cannot be agent-driven.
