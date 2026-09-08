# Audit and evidence

Agent Pipeline helps a team retain reviewable delivery evidence. It does not certify compliance, grant an approval, or replace an auditor's assessment. Evidence is useful when it stays bound to the exact candidate and when its limits remain visible.

## What an audit package can contain

- A Verify receipt records the command, candidate commit and tree, individual suite results, and the resulting status. It is evidence of that run, not a statement that every control or legal obligation is satisfied.
- An [Audit Bundle](audit-bundles.md) is a create-only, offline-verifiable copy of a validated Feature Package. Its manifest binds the candidate, policy digest, copied artifacts, and their digests. Signing is a separate operation; a signature binds bytes but does not establish legal identity, key custody, trusted time, or authorization.
- The [Evidence Viewer](evidence-viewer.md) makes a static offline projection for review. A broken package is labelled invalid, and a view cannot change governance authority. Use its redacted sharing mode when source paths or other private details should not travel with the report.
- [Governance replay](governance-replay.md) reconstructs a lifecycle timeline from retained, verified events. An incomplete, stale, prefix-valid, or invalid stream is unavailable; the viewer does not turn partial history into an authoritative narrative.

The optional audit and evidence CLIs are explicit local entry points. They do not run merely because a hook runs, and they do not publish a bundle or prove external retention. [Governance event export](governance-event-export.md) is also a separate, policy-sanitized transport observation: delivery receipts are not approval, compliance, or Pipeline authority.

## A safe review path

Start with the Feature Package and its candidate-bound Verify receipt. Validate the package before building a bundle, keep the manifest and source records that an audit needs, and use the detailed pages above for the exact local CLI contracts. Keep the human approval record and any external change record in their own authority boundaries; an audit artifact does not replace either.
