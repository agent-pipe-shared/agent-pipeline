docs(adr): a PRD may name its user documentation; the review asks and the close offers one reader review, and neither blocks (ADR-0105)

The PO decided on 2026-11-19 (tiles) that a project governed by the pipeline gets a way to name its end-user documentation, built in candidate 32, as a hint that never blocks, with one reader review at the close of a feature. ADR-0105 records it: an optional "User documentation" section in the PRD template; the readiness reviewer asks about a missing one once as a question, never a finding; the close step of the happy-path guide runs pipeline-core:reader-review once on the named documents and treats it as no gate; no schema key, registry entry or readback row, so nothing can refuse on it. The precedent is the module adrReferences, which the review asks about and the close only reports.

The usage chapter says so in one paragraph; the governance classification lists the ADR as a public-user document (the plugin's reader-input mirror follows at the next sync). The register entry follows with the handover update.

AI-Assisted: true
Dispatch: stage-0 (elephant)
