fix(override): every git attempt of a planning is capped by what is left of its deadline

The bounded retry of candidate 31 capped only the retry by the planning deadline (9 s, below the 10 s hook limit). The first attempt of every call still ran with the full 5 s, so after a retry that used the budget the next call of the same planning could run another 5 s and the hook was killed by its host instead of ending in the typed HGO-GIT refusal the base produced at the first timeout.

Every attempt of a call that carries a deadline now takes min(5 s, what is left), with a floor of 500 ms so that a fast git call is never starved and the timeout stays a positive number (spawnSync reads 0 as no limit). A call that finds the budget spent ends in the existing ETIMEDOUT outcome of HGO-GIT: no new code and no new refusal. L16-5 pins the three timeouts of one planning (5000, 4000, 500). The deadline still starts per topology() call and the observation calls that follow it carry none, as before; that second half of the finding is reported open (seven call sites would need the deadline threaded through the topology result).

AI-Assisted: true
Dispatch: stage-0 (elephant)
