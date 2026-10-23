# Post-sitting check table, 2026-10-23

Measured by `node scripts/post-sitting-checks.mjs` at commit `f4eff0f7b` (step 48b of the sitting runbook, the last step), after the operator applied steps 01 to 34, 36 to 47, 48a and 48b (step 35, the Critic preimage re-pin C28, deferred by PO decision). Status: sitting steps committed by the operator; the two `CLAUDE.md` lines of the sitting sheet were added by the operator in `a144b415a`; PO acceptance is still pending.

| Check | Verdict | Result |
|---|---|---|
| suite-registration | GREEN | 1093 registered (expected 1093) |
| case-completion | GREEN | 361 entries, 347 conservatively classified suites |
| capability-inventory | GREEN | PASS |
| observation-governance | GREEN | 252 documents classified |
| reader-inputs | GREEN | mirrors and pins equal their sources |
| backlog-state | GREEN | valid, 22 tolerated DRIFT lines |
| architecture-boundary | GREEN (exit 1) | 22 `unowned-path` findings for `scripts/*.mjs` (PO list rows 45 and 51), 0 over-line-bound |
| doc-contracts-test | GREEN | 76 of 76 |
| consumer-safe-paths-test | GREEN | 9 of 9 |
| doc-contracts | GREEN | 2586 Markdown files, 1977 links |

10 of 10 checks green. Operator-side readbacks during the sitting: step 37 registered 1092, step 39b registered 1093, step 47 synced 5 Reader-input drift items and then passed its mirror check, step 48b left the mirror check at PASS.

Still open after this table (see `plans/sitting-preparation-index-2026-10-23.md`, section 4): restate the four stale `sites` counts of `harness/scripts/check-verify-case-completion.test.mjs` and the registration fixture, the serial count pass, the delivery remeasure, the Reader closure (K140 diffs, third round, terminal record), then on the PO's call the dev build, Critic batch, Full Verify, C28 re-pin, final stamp and push.
