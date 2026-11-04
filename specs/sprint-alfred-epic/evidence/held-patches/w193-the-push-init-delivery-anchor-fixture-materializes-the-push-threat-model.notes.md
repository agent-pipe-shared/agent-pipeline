# w193 — the push-init delivery anchor fixture materializes the push threat model

Candidate 19c, found by running `push-init.test.mjs` on the rehearsal tree of the whole chain. The w176 slice did not run that suite; it is green on the unchanged tree and red with w176 alone (case N27 anchor).

- **What:** the `deliveryRepo` fixture of `scripts/push-init.test.mjs` (an active push approval, `approval: required`) commits `project/push-threat-model.md` in its init commit, before the verified candidate. QG-04 restatement with a comment; no assertion changed.
- **Why:** w176 (D4a) makes push preparation refuse with `PUSH-THREAT-MODEL-MISSING` when a push approval is active and the file is absent, which is the intended new behaviour. The fixture's expectation that the delivery is offered can only hold when the gate's own precondition is met.
- **Not changed:** the gate, the other cases of the suite, the `deliver-verified-candidate` logic.
- **Verified in the rehearsal clone:** `push-init.test.mjs` 43/43.
- **Not proven:** every other suite that drives push preparation with an active push approval; a serial sweep of the suites that touch the D4a sites is run on the same tree (see the plan).
- **Criterion:** AC-108 is the closest accepted criterion; PRD and Spec are unchanged.
- **Apply order:** after w176.
