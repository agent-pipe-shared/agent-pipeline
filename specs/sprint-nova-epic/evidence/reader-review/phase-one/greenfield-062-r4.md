# Reader review phase one — greenfield-062-r4

Fresh blind read of the eleven public entry documents at reviewed commit
`bf304b4f76a7abd9e04d4891e49d4a6fc8b1e0d0`. The reader received no earlier
reports, inventory, governance, diff, history, or conversation and made no file
changes.

- **RR-R4-01 — contradictory review order.** README says deterministic gates
  run before every LLM judgment, while PIPELINE_FLOW permits Advisor and
  LLM-based readiness work before implementation and Verify. Limit the absolute
  statement to independent result/Critic review.
- **RR-R4-02 — contradictory Codex hook statement.** SETUP says Codex currently
  has no `SessionStart` hook, while the generated enforcement reference lists a
  Codex `SessionStart` registration for `startup|resume|clear|compact`. Make the
  two public statements describe the same boundary.
