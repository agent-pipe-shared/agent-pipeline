# A1-2 adapter and injected-matrix verification

Checkpoint date: 2026-09-06. Candidate: `056ca6931d7ca31bab248ab199542956591938c4`.
The implementation history is the exact enumerated set
`33df8a4bf26f736a31f13303236e24bfac04d8e5`,
`d9c4e163b54c65abd0d3698487772eb2f57555df`,
`356b98fdbe117736b3a528cc87015cabf085e171`, and
`056ca6931d7ca31bab248ab199542956591938c4`.

## Verified adapter evidence

- `evidence/a1-schema-freeze-digest.json`: result `passed`; revision `2`;
  expected and actual digest both
  `c3dd914f491b6dfd3eadfee5d05ad5e7143036b80af3048eb8903c2b5bd432c4`.
- `evidence/a1-probe-matrix-tests.tap`: Node TAP reports 18 tests, 18 passed,
  0 failed, including the injected four-surface matrix and marker/binding
  regressions.
- `evidence/a1-binding-regression-tests.tap`: Node TAP reports 18 tests, 18
  passed, 0 failed, including immutable binding preservation across metadata
  drift.

These artifacts verify the A1-2 adapter/matrix kernel and its injected-fixture
classification behavior. They do not claim a native orchestrator/subagent
interception pass: no live enforcement pass was obtained from injected
fixtures, and unavailable host capabilities remain unavailable/unknown.

## Open work

Native runner bridges and live measurements remain open, as does executable
A1-3 evidence packaging. The accepted suite-plus-capability coupling is ready
for the later TP-3 registration act after A1-2 stabilization; it has not been
registered here. Full Verify and Critic are pending known registration debt,
so this checkpoint must not be read as full-A1 stable or accepted.
