docs(auth-inventory): list the three PO approvals added since candidate 28e

check-auth-gate-inventory-drift had been red since candidate 28e: its
real-repository case found the PO approvals spec-addendum (ADR-0095),
acknowledge-gate-definition-changes (ADR-0096) and
acknowledge-maintenance-red-check (ADR-0097), with their verbs
approve-spec-addendum, approve-gate-change-acknowledgement and
approve-maintenance-red-check, missing from the human authorization
inventory and from the terminal action catalog.

- docs/human-authorization-inventory.md: one canonical row per approval
  (what it binds, the gates.human_approval mode, the sources) and its
  terminal disposition row (legacy-renderer).
- templates/human-terminal-actions/catalog.json: one legacy-renderer
  entry each, producer the pipeline-state verb.
- The catalog pin restates its count from 22 to 25 with the reason.

AI-Assisted: true
Dispatch: stage-0 (elephant)
