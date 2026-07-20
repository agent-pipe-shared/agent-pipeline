---
schema: "pipeline.backlog-item.v1"
id: "pipeline.source-available-commercial-licensing"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-20"
source: "Sentinel SNT-1 licensing gate recovered during Public Core transfer"
due: "2026-08-10"
expires: "2026-08-17"
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

## Remaining gate

Before a release or public product activation, record the named
rightsholder/legal review and candidate-bound license evidence through the
sanctioned close writer. This item remains in progress until that human gate
is explicitly recorded; the technical scanner blocker is resolved.
