---
schema: pipeline.backlog-item.v1
id: pipeline.osv-findings-have-no-reviewed-waiver-route
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover (PF-99 part b), 2026-10-29; Elephant triage 2026-10-29"
done_when: manual
---

# An osv-scanner finding that is a reviewed non-issue has no waiver route

## Evidence

A consumer project's push is blocked by one high osv finding on a transitive dependency whose version is pinned by a third-party package. The advisory text lists affected versions that do not include the installed one, while the machine-readable range starts at "introduced 0" and contradicts the text; the installed pattern is bounded. The only fix is a major upgrade of a dependency the project does not control. The manifest has no waiver route for osv; the policy inputs recorded in the evidence are only `.gitleaksignore`, the license allowlist and the semgrep rules.

## Wanted

A documented, reviewed waiver for a scanner finding with an owner, an expiry date and a written reason, bound to the finding identity so a changed finding is not waived. Design (where it lives, who approves, how it shows in the evidence) is not decided: 0.7.1, PO design review first. Not a hard blocker for 0.7.0.

## Not covered here

The gitleaks course-key exemption (PF-99 part a) is done separately; the consumer-defined scanner exceptions and the correction-budget accounting have their own items.
