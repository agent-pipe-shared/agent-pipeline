fix(approval): wait for a human signature silently and label the time as PO wait

Codex greenfield run 3 (C9): the agent waited 570 s actively on a human
signature and posted repeated status messages; the push-approval
reference said "end the turn" while the driver hands out a bounded
waiting process. PO tile 2026-11-13: bounded wait, silent, labelled PO
wait.

- signed-proof-wait: every wait result carries waitedSeconds and
  waitClass "po-wait" (PROOF_WAIT_CLASS). A PROOF-WAIT-TIMEOUT no longer
  asks the PO again: its repair says the PO already has the one signing
  command, repeat nothing, post no status message, wait again.
- afterSigning states the silent wait and the PO-wait label.
- push-approval reference: waiting is the step's own bounded waitAction,
  run silently, instead of ending the turn.
- usage-ledger --timeline reads a proof-wait result in a tool output and
  counts its waited time as human wait (shown as signature wait), so the
  net run time no longer contains the signature wait.
- Tests: pin C29-C9 with an injected clock plus the CLI label on the
  existing timeout case; usage-ledger C29-C9 timeline case.

Checkpoint-Intent: candidate 29c, Codex run 3 C9
AI-Assisted: true
Dispatch: stage-0 (elephant)
