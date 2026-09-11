# Boundary-aware Verify closure evidence

Date: 2026-09-11  
Item: `pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it`

## Decision and implementation

- The PO selected affected-area verification for ordinary work, Critic,
  candidate and push boundaries, with full verification retained for a real
  release flow.
- Accepted ADR-0081 records that boundary and supersedes ADR-0065 Decision 8
  for ordinary runs.
- `2c890778d383687794905906c224e7194d1c07ee` implemented the selection,
  evidence and consumer contracts. `harness/scripts/verify.mjs` enables
  cross-candidate receipt reuse only when the selection execution is
  `impacted`.
- `5c826023a728070b12a3af356e2733f1e382a29e` corrected the independent
  Critic's findings: equal or non-ancestor bases force full execution, the push
  guard independently rejects forged impacted ancestry, and consumer fallback
  evidence retains its real changed and unmatched paths.

## Deterministic verification

The correction candidate passed:

- 97/97 direct selection, producer, journal, push-satisfiability and
  publication-evidence tests;
- 169/169 `guard-push` cases, including the real unrelated-base rejection;
- Verify suite registration with 528 registered and zero unregistered suites;
- `git diff --check`.

The consumer fallback test proves that a full fallback executes both configured
area commands and the full project command. Release selection remains full and
publication derivation still requires release-mode full evidence.

No full release Verify is claimed by this closure. Full Verify remains a
release-candidate gate and is intentionally separate from closing this
ordinary-boundary mechanism.

## Independent review

The first fresh Session Critic review of `2c890778^..2c890778` returned FAIL:
one blocker for `--mode push --base HEAD` producing empty impacted evidence and
one minor for erased fallback paths. After the correction, a fresh delta
re-review of `2c890778..5c826023` returned PASS with
`functional-equivalent-read-only; OS isolation not asserted`. It confirmed both
findings closed, the guard's independent ancestry check, the focused coverage,
and unchanged full release/publication enforcement.

Native Codex sandbox execution under WSL is outside this acceptance claim. The
review used the ordinary fresh-context Session Critic route and makes no OS
isolation assertion.
