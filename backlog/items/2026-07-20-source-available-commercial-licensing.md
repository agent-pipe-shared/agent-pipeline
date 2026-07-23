---
schema: "pipeline.backlog-item.v1"
id: "pipeline.source-available-commercial-licensing"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
source: "Sentinel SNT-1 licensing gate recovered during Public Core transfer"
due: "2026-08-10"
expires: "2026-08-17"
closed_at: "2026-07-21"
closure_repository: "self"
closure_commit: "2ddf3592ea004bd6e2a830a61bb02c931238070f"
closure_evidence: "backlog/evidence/2026-07-23-snt-1-activation-result.json"
---

# Establish the Public Core source-available licensing boundary

## Description

Keep the current Public Core candidate on the standard-near Sustainable Use
License Version 1.0 (SUL-1.0), with internal business use and free
non-commercial redistribution, and route commercial exploitation through a
separate commercial license.

## Current implementation

`LICENSE`, `LICENSE-DOCS`, `NOTICE`, `CONTRIBUTING.md`, the README license
surfaces, the dependency inventory, and the license-check inputs now describe
the same source-available boundary. No individual two-user license, price, or
contract term is created in this repository.

## Recorded disposition

The PO confirmed the candidate-bound SUL-1.0 boundary and accepted that this
repository will not create an individual or lawyer-reviewed two-user license.
That human disposition and the technical scanner evidence are recorded through
the sanctioned close writer. The independent HAW-E publication/release gate
still remains separate and may impose additional human or channel evidence;
closing this licensing item is not a go-live claim.
