fix(critic-preflight): name the one-command route among the listed prerequisites

prepare-dispatch.mjs critic --label <name> -- <check command> already
runs the diagnostic evidence, its registration and the preflight and
stops once for the evidence-only commit. The ordered prerequisites of a
feature package now end with that command, so an agent can take it
instead of walking the steps by hand.

AI-Assisted: true
Dispatch: stage-0 (elephant)
