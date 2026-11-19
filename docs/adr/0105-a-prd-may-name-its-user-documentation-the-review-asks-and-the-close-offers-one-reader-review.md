# ADR-0105: a PRD may name its user documentation; the review asks and the close offers one reader review, and neither blocks

> Agent-Pipeline · Sprint Alfred · 2026-11-19

**Status:** accepted (2026-11-19, PO tiles: build in candidate 32, a hint that never blocks, one reader round at the close). Built in candidate 32. Not yet used on a consumer repository.

**Context source (PO, 2026-11-19):** the PO asked that a project governed by the pipeline also gets user documentation for its own end users, and that the pipeline's own 0.7.0 documentation be brought to the current state. Of the shapes offered (a mandatory section, a hint, a hint without any follow-up) the PO chose a hint that never blocks, built in the current candidate, with one reader review at the close of a feature.

## Context

A feature can be delivered, reviewed and accepted while the people who will use it learn nothing: the PRD and the Spec describe what is built for the team, and a document for the end user is written, or not, outside any gate. The pipeline already has a reader review for documentation blocks (`pipeline-core:reader-review`, two stages, no PO gate), and a precedent for a design element that is asked about and never required: the module `adrReferences`, which the readiness review raises as a question and the close only reports.

The path of a design through review and signature was blocked three times in the greenfield runs of candidate 31 by refusals that no test had met. A new mandatory element in the PRD would be a new blocking reason on exactly that path.

## Decision

1. **An optional PRD section.** `templates/prd.md` gains "User documentation (optional)": the audience outside the team (end users, operators of a project that uses the change) and the documents that tell them what changed and how to use it, as paths or a README section, or one line saying none is needed.
2. **The readiness review asks, once.** When the PRD names readers outside the team and carries no such section, the reviewer raises one question in the full round, never a blocking finding, and says explicitly when the PRD names no outside audience. Nothing is stored and the report shape does not change.
3. **The close offers one reader review.** When the section names documents, the agent runs `pipeline-core:reader-review` once on them before the close command, resolves its findings or names them in its report. It creates no PO gate, and the close does not wait for it or read its result.
4. **No code gate.** Nothing refuses on a missing section, a missing document or an open reader finding: no schema key, no registry entry, no readback row.

## Consequences

- The behaviour lives in the agent-facing texts (the template, the reviewer definition, the happy-path guide) and is as strong as those are followed. That is the intent: a hint, not a gate.
- A later row in the close readback that lists which named documents exist (as it does for the ADR paths) is possible without changing this decision; it is not built now.
- The reader review costs one round per feature that names documents. A feature that names none pays nothing.
- If the greenfield runs show the section ignored, the PO decides whether to strengthen it; that would be a new decision and a new ADR.
