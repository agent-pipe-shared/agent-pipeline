---
type: workflow-improvement
status: new
created: 2026-07-20
source: Public V3 Foundation stabilization close authorship check: delivered Goldfish work packages lacked required public Dispatch trailers
---

# Preserve dispatch provenance for delivered work packages

## Description

The delivery record is incomplete when a work package is implemented through a
dispatched role but the resulting public commit omits the required Dispatch
trailer. Attribution may remain known in the active session, yet it is no longer
auditable from the durable public history alone.

## Triggering situation

The Public V3 Foundation stabilization close on 2026-07-20 found implementation
commits attributable to dispatched Goldfish work packages without their required
public Dispatch trailers.

## Affected artifact

The Goldfish delivery template, commit handoff procedure, and close authorship
check.

## Proposal

Require the dispatch record identifier to be part of the Goldfish commit handoff
before the coordinator commits or accepts a delivery. The close authorship check
should fail with a precise, public-safe remediation when a production diff lacks
both the dispatch record mapping and the matching `Dispatch:` trailer.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
