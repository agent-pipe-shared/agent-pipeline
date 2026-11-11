fix(architecture): refresh the receipt when a reopened design is approved again

A greenfield run on native Windows reopened its design for a one-value change
and got a new signature. The first materialization's receipt still named the
old digests, and the only exit from that refusal was another reopen. The run
got out by resetting architecture/ by hand. The receipt of the active feature is
now replaced after a new approval, each file only over its recorded bytes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
