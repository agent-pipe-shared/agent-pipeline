# Reader review phase two — greenfield-062-r4

Independent evidence check against the eleven public document blobs at
reviewed commit `bf304b4f76a7abd9e04d4891e49d4a6fc8b1e0d0`. The reviewer received
the phase-one findings, committed capability inventory, governance data, and
reader protocol, but no earlier rounds, diff, history, or conversation, and
made no file changes.

- **RR-R4-01 — confirmed.** Limit “before any LLM judgment” to independent
  Critic judgment of the delivered result. Advisor consultation and readiness
  can precede implementation and deterministic Verify.
- **RR-R4-02 — confirmed.** Remove the false claim that the Codex manifest has
  no `SessionStart` hook. Retain the accurate boundary: the hook is a hint and
  does not secretly perform the mandatory proactive `pipeline-start` action.

Both remedies change public documentation, so this is not a closure round.
