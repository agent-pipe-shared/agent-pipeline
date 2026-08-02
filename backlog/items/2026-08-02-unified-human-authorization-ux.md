---
schema: pipeline.backlog-item.v1
id: pipeline.unified-human-authorization-ux
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-02
source: PO product-direction decision during Sprint Cyborg CYB-4 PO-proof UX review, 2026-08-02
tracking: Current CYB-4 helper is a compatible first adapter only; no programme-wide migration or closure is claimed.
---

# Unify human authorization UX across Pipeline intents and gates

## Description

Human authorization must not remain a one-off PO-proof interaction in CYB-4.
The Pipeline needs one shared, detached-proof contract that all existing human
intents and configured human gates can adopt, and that every future sprint
uses by default. It must be easy enough for solo developers and small teams
while keeping private authorization material out of agents, chat transcripts,
repositories, CI, and Pipeline state.

## Triggering situation

During the first hands-on Cyborg PO-proof setup, the raw multi-command flow
failed when paths and shell variables were not persistent between commands.
The PO explicitly requested an executable, low-friction workflow and required
the approach to become programme-wide rather than a special case for one
threat-model gate.

## Affected artifact

The current foundation is `plugins/pipeline-core/scripts/po-human-approval.mjs`
and `docs/po-human-approval.md`, plus every current and future human-intent or
human-gate producer/consumer in Pipeline runners, desktop applications, and
sprint templates. An inventory is required before migration; no single gate is
the complete scope.

## Proposal

Define a versioned shared Human-Authorization contract with a stable detached
public proof and adapter boundary. Inventory every existing human intent and
configured gate, migrate it to the shared prepare/approve/verify UX, and make
adoption an explicit requirement for subsequent sprint design packages.

Desktop applications should implement Passkey/WebAuthn as the preferred native
adapter. CLI runners on Linux, macOS, Windows, and WSL should support an
external, passphrase-protected Ed25519/SSH-style key adapter with one-time
setup and a short repeat approval flow. IAM, hardware-key, and password-manager
adapters may be supplied without changing the common verification contract.

Acceptance must include cross-platform user documentation, a no-secret-agent
boundary, candidate binding and replay resistance, adapter conformance tests,
and an adoption check that prevents new one-off human-approval UX from being
introduced.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
