# K128-FALLBACK-RECEIPT-FIELD notes

Clone: scratch/clones/k128 (base main, already up to date). Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Cause and change (smallest reading, PO decision 2026-10-23, batch 12, row 41)
The receipt producer kept requestedRoute / observedIdentity only in its result, never in the receipt; nothing carried the typed fallback to present-plan.
Field (optional, closed, exact 4 keys), names taken from existing records, none invented: `fallback: {route: "fallback-self-dispatch", reasonCode, requestedRoute, observedIdentity}` (`route`/`reasonCode` from the canonical fallback result and dispatch-recovery-state; `requestedRoute`/`observedIdentity` from the producer). The briefing's `kind`/`reason` were examples; `state`/`evidence` of the preflight verdict were not taken (smallest reading; the evidence digest stays on the dispatch side).
- UNPROTECTED, committed in clone: `scripts/design-review-receipt.mjs` (flag `--fallback-reason-code`, needs `--requested-route`, else DRC-USAGE; result/CLI report echo `fallback`) = e73791ea7; pin cases + e2e assertions + pin header = c1e3ef59e.
- PROTECTED, in `scratch/agent-out/K128-fallback-protected.diff` (4 files): `lib/design-review-receipt.mjs` (kernel: closed optional key, `isDesignReviewFallback`, summary), `lib/design-approval-binding.mjs` (kernel: optional `fallback` on a reviewReceipts entry), `lib/design-consistency-check.mjs` (kernel: optional summary key), `scripts/pipeline-state.mjs` (present-plan prints `Review route: ...` line). No new module, no new import edge: no kernel-list or threat-model entry needed.
- Unprotected commits as one diff: `scratch/agent-out/K128-fallback-unprotected.diff`. Commit messages: `K128-msg-protected.txt` (protected), clone commits carry `Dispatch: K128-FALLBACK-RECEIPT-FIELD (goldfish)`. No registration needed: the cases are in the already registered pin and e2e suites.
- The clone STILL CARRIES the four protected edits in its working tree (not reverted, so they can be re-measured).

## Counts (each alone, private TMPDIR via scratch/k128-run.mjs; logs scratch/agent-out/k128-*.log, results k128-results.txt)
- RED before (pin point 7, 6 cases, `node --test --test-name-pattern="point 7" <pin>`): 1 pass (7b, the unchanged control), 5 fail on assertions (fallback undefined / not refused / not printed).
- Pin after: 31 tests, 31 pass, 0 fail (before: 25 cases).
- `design-approval-route.e2e.test.mjs`: 14 pass 0 fail (route 1 gained assertions: native presents no fallback line; fallback receipt named in the presented plan and in the signed binding). No separate RED run for the e2e addition (no stash/checkout allowed); the lib-level RED covers the same behaviour.
- `lib/design-review-receipt.test.mjs` 68/68, `scripts/design-review-receipt.test.mjs` 32/32, `lib/design-approval-binding.test.mjs` 42/42, `lib/design-consistency-check.test.mjs` 52/52, `harness/scripts/check-consumer-safe-paths.test.mjs` 9/9.
- `check-verify-case-completion.mjs`: exit 0 (357 entries). `check-verify-suite-registration.mjs`: exit 2 with 3 UNREGISTERED findings (clone-hook-readiness.refresh, commit-pipeline-owned, gitleaks-scratch-clones-exclusion); identical in the main checkout, unrelated, not mine.

## Apply results on the k108 state (throwaway clone scratch/clones/k128-check, from scratch/clones/k108)
- Protected diff: `git apply --check` clean (exit 0), direct, no three-way, no rebase.
- Unprotected diff: clean for the producer script and the e2e test. The pin file hunk at line 19 (header restatement) does NOT apply on k108: that state still has the pre-K111 header ("end-to-end course clause stays HELD ..."), and K111's QG-04 header commit is on main only. Order: K111 header commit first, then this; or re-cut the header hunk against k108. The new point-7 cases themselves do not depend on the header. Nothing was applied for real in k128-check (checks only); the pin was not run on the k108 state.

## QG-04
No assertion removed or weakened. Deleted lines are the replaced K111 header sentences ("This pin still proves the admission function only. It does NOT yet prove ...") as the briefing asked, and the `buildSubmittedFeature(prefix)` signature (now takes an options object). The header cites the PO decision.

## Risks / open
- Item text: backlog edits are forbidden here; the item's open entry "pin the fallback evidence on the single-review route" can now be marked built (cases `point 7a`-`7f`, route 1 additions); Elephant to update. The Elephant/skill must still pass `--fallback-reason-code` when producing a receipt after a fallback (briefing duty, not a guard); no doc/skill text updated.
- 7f is a source-text assertion; the behavioural proof is the e2e route-1 addition.
- Ratchet / boundary-policy effect: not measured. The cases are green only with the protected diff applied.
