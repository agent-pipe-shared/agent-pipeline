fix(guard): list the stop-outcome reader the K-34 refusal added to the kernel

lib/native-goldfish-host-state.mjs now imports
lib/native-goldfish-stop-outcome.mjs to name the sibling whose failed
stop made an unproven host commit, so GMWKC01 found the never-liftable
kernel list no longer transitively closed. The module joins the list,
and the maintenance-window threat model says why it cannot be lifted:
a loosened reader could not admit the commit, but it could misname the
sibling and send the recovery to the wrong dispatch.

AI-Assisted: true
Dispatch: stage-0 (elephant)
