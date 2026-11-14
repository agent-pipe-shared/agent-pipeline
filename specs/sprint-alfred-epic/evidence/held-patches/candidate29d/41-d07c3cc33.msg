docs(backlog): file the concurrent-stop livelock and the dispatch-check gap

Two items for the candidate after 29d:
- The terminal release of two concurrent stops can keep invalidating
  each other's preimage until the stop budget ends (stop-pair NGSP7 and
  NGSP9D red in clean-clone runs before and after K-38; probe numbers
  in the item).
- Dispatch checks (*.check.test.mjs) run per item by the host but
  outside the consumer's own verify command, and nothing says so
  (peer consumer session toil, K-39).

The index, status table and ledger are derived and are refreshed by the
apply script.

Checkpoint-Intent: candidate 29d, open reds and K-39
AI-Assisted: true
Dispatch: stage-0 (elephant)
