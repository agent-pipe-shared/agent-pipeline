# Standing Critic-consent reprompt observation — 2026-09-09

## Observed sequence

- The PO’s standing consent for genuine repository Critic reviews through the
  configured Codex route is recorded in
  `backlog/evidence/2026-09-09-local-candidate-po-decisions.md`.
- A later request in that established review scope was rejected by the external
  automatic approval layer for private payload/destination consent before a
  Critic child was created. No payload transfer, provider child, receipt, or
  review verdict resulted from that rejection.
- The PO explicitly reapproved the concrete same-scope review request and
  requested a future change so established-scope Critic work does not require a
  repeated approval prompt.
- A separate live transport attempt subsequently ended before child creation
  with `selected-sandbox-required`. That result is a distinct technical failure
  under separate investigation; it neither proves nor remedies the consent
  repetition.

## Boundary for the future investigation

The observation does not establish a repository guard or hook defect. The
automatic approval layer is host-owned, so a future repository change may only
pass truthful, narrow scope context through supported interfaces. It must not
bypass a rejected host decision or treat standing consent as authorization for a
changed destination, private-input class, Critic purpose, expiry, or revocation
state.
