fix(native-host): name a refused stop integration and repeat it on a sibling race (K-38)

Glossover, parallel run 2026-11-14: wait-host-commit answered
"committed" with "integration":"refused" and no reason. The Elephant
could not tell whether a step was needed. The stop hook's own text held
the code, SDC-AUTHORITY-CAS: a compare-and-swap conflict with a sibling
stop writing the registry at the same moment. The integration ran once
and was never repeated.

The stop outcome now keeps the integration's code and reason, and
wait-host-commit returns them, together with what they mean: the
delivery is committed and is not re-dispatched. The commit evidence
releases its dependents when the Dispatch trailer names the slice id,
and slice-queue next shows whether one is still held.

The integration step repeats SDC-AUTHORITY-CAS, SDC-LOCK-HELD and the
sibling races the terminal release already repeats, on a fresh
boundary. It runs at least eight rounds and more while the stop's wait
budget lasts, with the same capped pause. Every other refusal, and the
last one, is returned (NGHS73, wait-host-commit K-38 case).

AI-Assisted: true
Dispatch: stage-0 (elephant)
