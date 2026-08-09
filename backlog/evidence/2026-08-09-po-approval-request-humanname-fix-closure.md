# Closure evidence: `po-approval-request.mjs verify` humanName authority mismatch

- **Fix commit:** `faf4c8dd7c2d01b11d6111ad3512e5e9b7b1f0b0` (GF-069, goldfish-deep).
- **Independent verification (Elephant):** diff read directly (`git show`), the
  targeted suite (`threat-model-approval-request.test.mjs`) re-run and
  confirmed green (39/39).
- **Critic review:** claude-opus-5 at max (this time with the model actually
  set on the dispatch — see
  [[feedback-agent-tool-model-param-required-for-dispatch-discipline]] for the
  process fix this took two attempts to land), functional-equivalent-read-only
  lane. Verdict: **FAIL overall**, but the reviewed commit itself was
  explicitly cleared — "the code change under review is correct, minimal and
  genuinely tested... No finding against the reviewed code change itself." The
  FAIL rested entirely on three findings, none requiring any change to
  `faf4c8dd`:
  - **F1** (major): the item's own mandated caller sweep ("grep for any other
    direct caller of `verifyPoApprovalProof`/`verifyThreatModelApprovalRequest`/
    `verifyCriticalActionApprovalRequest`...") was not actually performed —
    GF-069's evidence record substituted a narrower test-file-import grep.
    Performing the mandated sweep surfaced a third, live instance of the same
    defect class in `guard-maintenance-window.mjs install --authority` — filed
    separately as
    `2026-08-09-guard-maintenance-window-rejects-a-fresh-setup1-authority-file.md`.
  - **F2** (major): no Full Verify run exists bound to the reviewed candidate
    commit — `evidence/verify-latest.json` was bound to a commit five before
    `faf4c8dd` at review time. Resolved: a Full Verify run bound to a later
    commit that includes `faf4c8dd` in its history (this repo's linear branch
    history means every ancestor commit's changes, including this one, are
    exercised by any later clean Full Verify run) — see the candidate-build
    Full Verify run recorded in this session's state update.
  - **F3** (minor): the dispatch record's claim that
    `guard-maintenance-window.mjs` was "confirmed unaffected" does not survive
    inspection (superseded by F1's finding) — noted as a self-report accuracy
    gap, no further action beyond F1's sibling item.
- **This item's specific scope** — `po-approval-request.mjs verify` rejecting
  a fresh, correctly-generated SETUP-1 (3-field) authority file — is fully
  resolved and verified. The newly-discovered third sibling instance
  (`guard-maintenance-window.mjs`) is tracked in the item referenced above;
  this item is closed to that exact scope, not to the broader class, exactly
  as the pattern established for the first two instances.
