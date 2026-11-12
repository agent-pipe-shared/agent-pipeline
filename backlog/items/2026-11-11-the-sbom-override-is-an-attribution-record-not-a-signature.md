---
schema: pipeline.backlog-item.v1
id: pipeline.the-sbom-override-is-an-attribution-record-not-a-signature
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: Candidate 28c design; ADR-0091 decision 5
sprint: alfred
done_when: manual
---

# The SBOM override is an attribution record, not a signature

## Description

A blocked SBOM (`stale`, `invalid`, `partial`, `unsupported`) passes the close only with `--sbom-override "<the human's literal words>"`. The words, the actor and every covered finding are recorded in the SBOM record and the audit bundle names it `SBOM-OVERRIDDEN`. Like the human acceptance answer, this is an attribution record: the flag is something an agent could pass on its own, and the close skill forbids that, but nothing proves a human said it.

## Decision

Open for the PO. The options are to keep it as an attribution record, to bind it to the existing human acceptance record, or to require a signed approval for the override.

## Done when

The PO has chosen, and the chosen binding is built with a test that an unsigned or unbound override is refused.
