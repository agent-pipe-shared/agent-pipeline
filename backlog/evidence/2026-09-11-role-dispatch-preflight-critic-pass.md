# Role dispatch preflight — correction Critic PASS

Reviewed range:
`4974e8a988b1a13bc60ca17d2aad838174eac103..a27b5034cb62b5e19e92c5ddf5ffebe3b85dc56c`

Verdict: **PASS**, no findings.

The correction makes candidate-file lookup invoke Git with
`--literal-pathspecs`. A value such as `:README.md` is therefore treated as an
exact filename and cannot select the real `README.md` through Git pathspec
syntax. The registered regression fixture proves rejection as
`RDP-REQUIRED-PATH` with zero model and launcher calls.

Trajectory was consistent. Verify run
`verify-1789111834812-febceb0075917326` binds exact candidate
`a27b5034cb62b5e19e92c5ddf5ffebe3b85dc56c`, tree
`b5b9227731372cea589e388670193dc30ae241f9`, a clean start and finish, the
dispatch-policy suite, and exit code 0 across 520 checks.

The Critic found no scope, test-integrity, dependency, security, governance,
architecture or language issue, and no briefing violation.

Assurance: `functional-equivalent-read-only; OS isolation not asserted`.

## Complete reviewer-input correction

Reviewed range:
`07b9935a6b697e1eea5d883dbf35a28db87a6186..06b95a567adfd8b53445b88ae8d11e352828a175`

Verdict: **PASS**, no findings.

The preflight's `reviewerInput` now carries its frozen candidate commit as
`rulesetSha`, both resolved governance directory paths, the expanded
candidate-file guardrails and candidate-bound evidence paths. The session
route adds only `project`, `verdict` and `assurance` metadata. A no-governance
manifest produces an explicit empty directory list.

Verify run `verify-1789115373209-c40902661ee505b8` first reported 519/520 and
identified only the expected protected-preimage mismatch for the changed
Critic skill. After restamping that exact SHA, candidate-exact run
`verify-1789115656401-e39eac8fe41490a7` passed all 520 checks for commit
`06b95a567adfd8b53445b88ae8d11e352828a175`, tree
`eafbc7151cd1144c2897d93626a711aa56bac24f`.

The independent Critic cleared scope, reachability, test integrity, the
no-governance edge case, protected-contract integrity, governance, security,
dependencies and language. Assurance:
`functional-equivalent-read-only; OS isolation not asserted`.
