---
schema: pipeline.backlog-item.v1
id: pipeline.loaded-ruleset-identity-is-unavailable-for-claude-local-dev-and-consumers
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "PF-23 binding generator work, 2026-10-18"
sprint: none
done_when: manual
---

# The loaded ruleset identity is unavailable for Claude local development and consumers

## Description

`dispatch-briefing.mjs binding` needs a ruleset identity for the binding. On Claude local
development and in consumer projects, the loaded identity is not available. b4bb60a9d added a
fallback with a `DBG-RULESET-FALLBACK` warning: first the installed identity, then a content
hash of the loaded plugin root. The host only format-checks `rulesetSha`, so the fallback
works. Still, the binding does not carry the identity the session actually loaded.

## Triggering situation

The first item-governed Goldfish dispatch in a consumer project (PF-23).

## Proposal

Have bootstrap record the loaded ruleset identity where the generator can read it, on every
runner. Then retire the fallback warning for that case.

## Acceptance

- In a ready Claude consumer session, the generator reads the loaded identity without a
  fallback warning.
- The fallback stays, with its warning, for sessions without a recorded identity.
