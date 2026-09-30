---
schema: pipeline.backlog-item.v1
id: pipeline.existing-signing-key-reuse-deadlocks-onboarding
type: bug
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
