---
schema: pipeline.backlog-item.v1
id: pipeline.guard-override-message-misassigns-roles-and-omits-signing
type: defect
owner: pipeline
status: open
created: 2026-09-07
source: "PO takeover report and source inspection of the signature-mode guard recovery messages on 2026-09-07."
sprint: nova-b
done_when: manual
---

# Guard override message misassigns roles and omits the signing step

## Description

The signature-mode denial message lists preparation and digest emission in the
session, then places `authorize-by-signature` under its outside-session heading.
It mentions the external Ed25519 key but supplies no signing command between
digest emission and proof verification. A reader therefore receives an incomplete
procedure and an inaccurate assignment of the proof-verification step.

## Triggering situation

The PO reported this confusion while approving gate changes. Source inspection
of the current signature branches in `guard-gate-strength.mjs` and
`codex-pretool-guard.mjs` confirms the missing signer action and the placement of
`authorize-by-signature` under the external heading. This is separate from the
nonliftable lifecycle-denial defect; correcting that eligibility does not repair
the instructions for legitimate signature-mode overrides.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-gate-strength.mjs`
- `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`
- Other native guard renderers sharing the signature ceremony
- The documented signer and verifier interfaces and their message tests

## Acceptance criteria

- Derive the instructions from the existing governed signature procedure.
- Assign plan preparation and digest emission to the coordinator where admitted.
- Name the actual human-held-key signing action, its exact input and proof output.
- Assign proof verification/authorization to the appropriate admitted execution
  context; do not imply that verification itself needs access to the private key.
- Preserve mode, digest, identity, expiry, signature and no-bypass protections.
- Exercise rendered instructions for signature and chat modes; preserve legitimate
  external-operator-only boundaries and offer no ceremony for nonliftable errors.
- Review the instructions as an executable sequence with clear roles. A rendered
  command string alone does not prove a successful signing ceremony.

## Triage

- **Decision:** retain as an open Nova B finding from the takeover.
- **Rationale:** confirmed message gap; independent of the current lifecycle repair.
- **Assignment (if accepted):** bounded ceremony-message repair after candidate-critical work.
- **Date:** 2026-09-07
