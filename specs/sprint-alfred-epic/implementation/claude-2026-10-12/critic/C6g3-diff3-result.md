# C6g3 correction-DIFF review 3 of 3 (ordinal 4): result (2026-10-17)

- Candidates: `8926f1286` (ALF-C-C6G3-D2) and `ec9ea2d4f` (ALF-C-C6G3-D1), each reviewed with `git show`.
- Route: claude-sonnet-5-5, as observed in the runtime prompt. Lane: functional-equivalent-read-only.
- Verdict: **PASS**, no findings. This closes the C6g3 review budget (1 FULL + 3 DIFF).
- Trajectory: consistent. Both RED claims were reproduced by static reading, and no pins were executed.
- Critic notes: `scratch/dispatch/critic-abcbe469029a7f346/critic-notes.md` (local only).

## Registry

| ID | Status | Evidence |
|---|---|---|
| D1 | closed | The allowlist (`architecture-design.mjs:319-322`) now holds exactly the unprefixed DWP entries of the guard's `contentDrift` list (`guard-devplan-policy.mjs:274`). The parity pin (`foreign-worktree…:124-130`) calls the real `designAdvisoryRemediation`. Re-listing DIGEST-DRIFT turns the pin red. |
| D2 | closed | "E1 must precede implementation authority." is refused under `precedes? ` and cannot match the old spelling (`omits-contract.test.mjs:338-340`). Its negated twin at `:330` stays accepted. |

## Noted by the Critic, not findings

- **Digest drift as content drift:** the commit message leaves open whether the guard should treat digest drift as content drift. The resulting behaviour is non-destructive. A note with an owner and a due date would be cheap to add. → PO topic.
- **Parity check direction:** the parity pin checks one direction only. The live sets are equal today.
- **Pre-existing gap:** the sibling regex alternatives (`precedes`, `before`, `required for`, `prerequisite to`) have no refused-form case. This is not part of this diff.
- **Briefing deviations:** the registry reference was the prior result file, not a neutral extract. The Re-critic range also contains `a9aeb9d63` and `32725e521`, which are outside the enumerated list. The Critic used neither.
