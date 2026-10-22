---
schema: pipeline.backlog-item.v1
id: pipeline.existing-signing-key-reuse-deadlocks-onboarding
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield review B2/B3: onboarding tried to import a key already at the canonical destination, while its human override needed that key."
sprint: alfred
done_when: manual
---

# Reuse a canonical PO key and provide attended first-anchor recovery

The onboarding driver must recognize an existing canonical `po-private.pem`
without copying or replacing it. Bind the public fingerprint to the private
key and preserve existing bytes. For a driver failure before trust-anchor
setup, provide a narrow external-terminal recovery using the same first-anchor
transaction, a typed digest confirmation and an audit record explicitly
labelled as unattended-by-signature. It grants no general guard or lifecycle
bypass. Test replay, path aliases, Windows spelling and wrong-key refusal.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-SIGNATURE** — Windows spellings and owner-only DACLs are exercised by string spelling on Linux; run on native Windows and drive the attended recovery from a real external terminal
  The attended first-anchor recovery is an operator ceremony from a real external terminal and uses the PO key; an agent must not drive or sign it. The Windows spelling/DACL pin part can be run beforehand through interop (WINDOWS-INTEROP-RUN), but the clause only closes with the operator step at the 18:00 sitting.
