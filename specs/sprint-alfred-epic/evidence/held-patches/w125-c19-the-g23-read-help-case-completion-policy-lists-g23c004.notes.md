# w125 — the g23 read-help case-completion policy lists G23C004

Found by Full Verify 6 on the applied candidate 19 state: `g23-read-help-tests` was red with `VERIFY-CASE-COMPLETION-DECLARATION` although all four tests passed (excerpt: G23C001 to G23C004 pass, 4 of 4). The suite gained `G23C004` in candidate 18 (C18-8), but its inline policy in `harness/verify-suites.json` still listed only G23C001 to G23C003. Run alone with `node --test` no declaration descriptor is announced, so the suite looked green alone and was only rejected inside the Full Verify.

Change: one line, `G23C004` added to the `caseIds` of the suite. Nothing else.

Evidence and limits:
- The patch applies cleanly after w124 (checked in the applied-state clone) and to the repository HEAD.
- Not re-measured in a Full Verify: the case-completion tool `run-cc.mjs` reads only the augmentation row and the inline policies of `verify.mjs`, not `verify-suites.json`, so it cannot confirm this fix (it reports 0 ids for this suite). The reasoning rests on the red excerpt; the next Full Verify is the proof.
- Tooling follow-up: teach `run-cc.mjs` to read the `caseCompletion` policy of `harness/verify-suites.json`.
