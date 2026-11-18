fix(refresh): a suite that fails a case after it declared its ids is still read by the case-completion step

The step reads the ids a suite declares by running it. The ids are announced when the suite registers, before any case runs, so a later failing or timed-out case does not change them and Verify, not this step, judges the case. native-goldfish-host-stop-pair is a slow timing race that exited 1 in the refresh on every rehearsal of the 30k chain and left the human at a half-applied chain. A non-zero exit with a declared list is now a reading, named as a note line by the refresh; a suite that dies before declaring (a throw at load) stays unreadable and fails the step as before. RDF18 pins both the reading and the note.

AI-Assisted: true
Dispatch: stage-0 (elephant)
