# w314 — the Goldfish briefing fits the runner's commit and the RED evidence path (candidate 31, lanes L7 + L8)

Chained on the base clone of candidate 31: apply that held patch first, then this one (a delta on it; it does not apply to the real checkout alone). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `lib/dispatch-briefing-build.mjs`, L7: field 4 of the generated briefing renders the commit line per runner. The builder knows the runner (`pkg.runner`, the same input `worktreeLine` already reads). For `antigravity` the line says the child commits its owned files on its worktree branch with the briefed `Dispatch: <id> (goldfish)` trailer before reporting (and names `AGYI-NO-COMMITS`, the refusal of `agy-native-integrate` otherwise). For every other runner the host-commit line is byte-identical to before.
- Same file, L8: when the test-first paragraph is rendered (criterion plus a test path), the scope statement adds the optional RED evidence file `specs/<feature>/evidence/<id>-red-evidence.txt` (feature taken from the package's spec path; `evidence/<id>-red-evidence.txt` if the spec is not under `specs/`), and the test-first paragraph names the same path. It is derived from the dispatch id; evidence stays optional, self-attested, no gate. `allowedPaths`, the binding and the return schema are untouched.
- `scripts/dispatch-briefing.test.mjs`: three new cases (Antigravity commit instruction, Claude line byte-identical, scope lists the evidence path). RED first against the old code (2 failed), GREEN after: 199 of 199.

## Not changed

- The top-of-briefing native host directive (`NATIVE_GOLDFISH_HOST_DIRECTIVE`, lives in another module, outside the write list) still says the host commits; the Antigravity line in field 4 states that it does not apply to the branch-worktree child. Aligning that directive is a follow-up in its own module.
- The host's handling of an untracked evidence file outside `changedPaths` was not measured; the wording says it is not a changed path.
- Host commit rule, return schema, admission code, stored statuses and digests.

## Not proven

- No Critic (suspended by the PO for candidates) and no Full Verify: tests only (`dispatch-briefing.test.mjs`, `w314` check).
- No live Antigravity run.
