fix(tools): give run-parallel workers a HOME short enough for a socket address

SHDQ002-007 failed SP-ADDRESS on every run-parallel worker, on 29b as
well. The discard-isolation fixture places its synthetic home under the
process HOME only when that HOME is at most 40 bytes; the worker HOME
<home>/pipeline-test-tmp/par-<label>/home-<n> is longer, so the fixture
fell back to a home inside the checkout, where the session-power socket
address no longer fits Linux's 107 bytes. The worker HOME and TMPDIR now
live under <home>/.ptp/<8-hex label digest>/h<n> and t<n>, whatever the
label length, and the runner warns when a HOME still exceeds 40 bytes.
A new run-parallel case pins the shape (red against the old runner,
green now); the operating-tools page says why the HOME is short. No
product change.

AI-Assisted: true
Dispatch: stage-0 (elephant)
