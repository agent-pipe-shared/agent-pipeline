---
schema: pipeline.backlog-item.v1
id: pipeline.consumer-defined-scanner-exceptions-need-a-po-approved-route
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.1
sprint: alfred
source: "PO, 2026-10-29 (answer to the PF-99 decision): a path in which, with a PO exception, a user repository can define further exceptions as well; Elephant triage 2026-10-29"
done_when: manual
---

# A consumer repository cannot define further scanner exceptions, even with PO approval

## Evidence

The scanner configuration is shipped by the plugin and resolved from the adapter module's own location, never from the scanned tree, on purpose: a candidate must not be able to weaken its own scan (`gitleaks.test.mjs` pins that a planted `.gitleaks.toml` is ignored). The only consumer-side route is a `.gitleaksignore` content fingerprint, and its repair script accepts plain domain values only. A consumer with a further tool-written false positive therefore has no route at all.

## Wanted

A route in which a consumer proposes a further, narrowly scoped exception (path and exact match, an owner and a reason) and it takes effect only after a PO approval bound to the exact exception and candidate, never from the candidate tree alone. The approval mechanism, the storage and the evidence it leaves are not decided: 0.7.1, PO design review first. The PO asked for this on 2026-10-29 and asked that it not reopen design in 0.7.0 unless it is a hard blocker; it is not, because the one known false positive (the course key) is exempted in the shipped configuration.

## Not covered here

The course-key exemption, the osv waiver and the correction-budget accounting have their own entries.
