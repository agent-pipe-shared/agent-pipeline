fix(approval): one bounded rule for waiting on a signature, the same text in every gate

The Codex greenfield report (candidate 31 run): the agent polled six acknowledgement waits of 570 seconds and a seventh of 252 seconds in a row, with no word to the PO, who asked what the signature was for and later asked to continue. The instructions disagreed: the wait text (signed-proof-wait.mjs, used by the acknowledgement route and by push-prepare) said PROOF-WAIT-TIMEOUT only means the file is not there yet and to run the wait again silently without end, while the push driver's humanGate said to run it exactly once and end the turn if it returns without a proof.

PROOF_WAIT_MAX_WINDOWS (4, about 38 minutes; earlier runs measured signing delays of 8 and 39 minutes) and one sentence, PROOF_WAIT_GIVE_UP, now carry the rule: wait silently for at most that many windows, then end the turn with one line saying the step still waits for the PO's signature, and continue from the same readback once the PO says it is signed. The afterSigning instruction, the timeout repair and the push driver's humanGate all use that sentence, and push-approval.md states it. Silence, no repeated signing command and the PO-wait label are unchanged.

Two pins are restated (QG-04, changed requirement): the humanGate no longer says "exactly once" (it names the afterSigning rule and the window limit), and the wait pin also asserts that instruction and repair carry the one sentence.

AI-Assisted: true
Dispatch: stage-0 (elephant)
