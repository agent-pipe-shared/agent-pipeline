feat(approval): hand the PO one fixed "Now from you" sentence per signing step

In the third Claude greenfield run three proof waits ran out while the
PO asked what was needed: the signing command had been shown, but no
single sentence said "this one command, now, and nothing else".

awaitSignatureFields now returns poNow: "Now from you: run this one
command in your own terminal, nothing else is needed: <command>  I wait
for <proof> myself, so you do not need to report back." The command is
the one the step itself rendered (copy-safe form first), passed by the
design approval, the four critical-action steps, push-prepare and the
onboarding signature; a key-directory proof derives its sign-intent
line. Without a known command the sentence points at the command shown
above instead of inventing one. afterSigning and the push-approval
reference tell the agent to relay it verbatim, once, before the wait.

AI-Assisted: true
Dispatch: stage-0 (elephant)
