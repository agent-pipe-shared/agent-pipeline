---
schema: pipeline.backlog-item.v1
id: pipeline.signing-stamp-is-provenance-not-authentication
type: improvement
owner: pipeline
status: open
created: 2026-10-17
source: "Critic C6g1 DIFF 1, candidate C-A (specs/sprint-alfred-epic/implementation/claude-2026-10-12/critic/C6g1-diff-result.md); PO decision 2026-10-17 (backlog)."
sprint: alfred
done_when: manual
---

# The in-assembly signing stamp and cache key are integrity, not authentication

## Description

The in-assembly stamp and the cache key derive only from public inputs. A
writer running as the same OS user can forge a matching entry. The check
therefore proves integrity against accidental drift, not authenticity against
an agent that writes the cache directly.

## Proposal

Decide whether the stamp must resist an agent-side writer (threat model,
PO decision 2026-10-17: protect against the agent). If yes, bind it to a
secret the agent cannot read, or re-derive it at the consumer instead of
trusting the cached entry. If no, document it as provenance in the code and
the guardrail.

## Acceptance

- Either a forged same-user entry is refused by a pin, or the code and the
  guardrail state explicitly that the stamp is provenance only.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** PO 2026-10-17: backlog.
- **Rationale:** Hardening; it does not by itself let the agent bypass a signature.
- **Assignment (if accepted):**
- **Date:** 2026-10-17
