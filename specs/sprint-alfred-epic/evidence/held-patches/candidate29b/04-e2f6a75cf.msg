fix(push-approval): an expired push proof names the way to a fresh signing command

Antigravity greenfield run 3 (R12): a push signed in the evening was
approved the next morning after its window had passed. The window is by
design, but neither approve-push (CRITICAL-ACTION-PROOF-EXPIRED) nor the
pre-push check (PUSH-PROOF-EXPIRED) said what to do next. Both now name
it: run push-init.mjs again with the same --remote and --destination for
a fresh signing command, have the PO sign that one, then approve-push
with the new proof. A caller that already carries its own renewal text
keeps it.

Checkpoint-Intent: candidate 29, AGY run 3 R12
AI-Assisted: true
Dispatch: stage-0 (elephant)
