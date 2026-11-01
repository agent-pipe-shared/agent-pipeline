# w36 — CLOSE-QUALIFICATION-REQUIRED names the audit route flags (N29 coordinator, D2)

Closes the D2 half of item 4 in `backlog/items/2026-10-30-candidate11-follow-ups.md`: the composed close stopped at
`CLOSE-QUALIFICATION-REQUIRED` with a text that named only the gate, not the way through it.

- `plugins/pipeline-core/scripts/close-coordinator.mjs`: the refusal now says to record the candidate's passing Verify and
  its Critic review as a Critic/Verify lifecycle, then plan the transition again with
  `--audit-request <path> --critic-verify-lifecycle <id>`, and names the request schema. The wording matches the existing
  `CLOSE-AUTHORSHIP-COMMIT-ONLY` repair text. Code and exit status are unchanged.
- `plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`: the existing
  case (rigor one, no delivery course) gains one `assert.match` on the message (extended in place, so the per-suite
  assertion pin is untouched in count).

Evidence: the pin suite and `pipeline-state-result-bootstrap.test.mjs` are green (52/52). Mutation: restoring the old
one-clause text turns exactly the extended case red.

Independent of the other held patches. Not a Full Verify; no Critic (paused by the PO).
