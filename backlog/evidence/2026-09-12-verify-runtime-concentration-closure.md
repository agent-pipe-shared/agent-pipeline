# Verify runtime concentration closure

Date: 2026-09-12

The four acceptance criteria in
`pipeline.verify-runtime-concentrated-in-ten-suites` are satisfied.

1. The item separates the 419-to-571.4-second regression into registered-suite
   growth (385 to 505) and the then-serial onboarding suite's 40.5-second
   growth. It avoids unsupported finer attribution.
2. `project-onboarding-v3-tests` was profiled and sharded in
   `72617333eb5fe0fa0740fe0e174c87759b3eca31`, reducing its same-machine direct
   run from 55.771 to 16.930 seconds with all 166 cases retained. The next
   measured serial lever, `codex-pretool-guard-tests`, was sharded in
   `298614da42bbbffb89878576b60747bdc18bced0`, reducing its direct run from
   29.73 to 12.90 seconds with all 36 cases retained.
3. Commit `0eba7f80f050d1affc819940e3a834db6cbc18b0` added the explicit `--no-reuse`
   path and established release-mode Full Verify as the regular wall-clock
   boundary. Its exact clean release run
   `verify-1789116678576-b18282647ee90a24` passed 520/520 suites, all fresh,
   in 188.208 seconds. The implementation and the exact run received an
   independent Critic PASS; durable details are in
   `backlog/evidence/2026-09-11-verify-fresh-same-candidate-pass.md`.
4. Obsolete-test cleanup is explicitly excluded as a runtime remedy and is not
   mixed into this closure.

Two later exact clean, all-fresh runs corroborate that the improvement holds
while the registered suite count increased to 534:

| Run | Mode | Candidate | Wall clock | Result |
|---|---|---:|---:|---:|
| `verify-1789190187745-453056d9cdc07532` | critic | `1e667395` | 189.320s | 534/534, Security 0 |
| `verify-1789191159893-51dc364fddf8aa2a` | critic | `c06df0c1` | 185.594s | 534/534, Security 0 |

Both receipts record zero reused steps and exact clean start/finish binding.
The latter run's ten largest suites also supplies the current residual ranking;
the leading entries are document contracts (30.675s), Antigravity guard tests
(28.885s), push guard tests (25.841s), Codex Critic host contract tests
(22.087s), onboarding (21.135s), and lifecycle guard tests (21.131s). This is
measurement, not a request to delete tests or increase concurrency blindly.

Native Codex sandbox and App-Server readiness under WSL is outside this closure.
Suites carrying those names here are offline contract tests, not native-runtime
acceptance evidence.
