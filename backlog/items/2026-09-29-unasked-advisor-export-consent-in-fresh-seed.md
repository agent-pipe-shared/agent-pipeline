---
schema: pipeline.backlog-item.v1
id: pipeline.unasked-advisor-export-consent-in-fresh-seed
type: privacy-bug
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
