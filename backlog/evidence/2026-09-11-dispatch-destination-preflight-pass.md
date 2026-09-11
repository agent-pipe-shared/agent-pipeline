# Dispatch result-destination preflight correction review

- Candidate: `2ea74dba`
- Focused suite: 31/31 passed
- Independent review: **PASS**, no findings
- Completion policy: required `DPT01` through `DPT31`

The shared role-dispatch packet now represents file, return and stream result
destinations explicitly. File destinations preserve containment, existing-file,
symlink-parent and required-input alias checks. Return and stream destinations
declare that no result file exists instead of bypassing file validation with a
fabricated path. Legacy `resultPath` packets keep their existing behavior.

The batch APIs propagate the coordinator-owned result root and treat legacy
and explicit file paths as one collision namespace. Every packet must pass the
initial PREPARE barrier. Each packet is then fully rechecked immediately before
its own launcher call. If an earlier launch changes the candidate input,
occupies a later result target or replaces its parent with a symlink, the later
packet returns `RDB-PREPARATION-STALE` and its launcher is not called.

The first independent review found the missing late recheck and three test
gaps. The correction added real launcher spies for malformed destinations and
inter-launch mutations, an externally-only-valid result-root case and a mixed
legacy/explicit duplicate. The second review returned PASS.

The modified test suite was migrated in the same candidate to the required
Completion protocol. It registers all 31 stable IDs before fallible fixture
work. Suite registration is 527/0, the registry reports 177 entries, checker
tests are 14/14, and the exact candidate-bound migration check passes.
