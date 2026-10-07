# Critic record — R7-6 key directory (po-human-approval part), delta 1

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 017df6cd5, dbe72ffd5, 4d57fa545, 3ad9d28d8, aa5ac90a0, a344f4346, e48199983, 04ac1be5a, 3a97d017b (base b6e529fd0).
- Verdict: **withheld — partial review** (80 % checkpoint; guardrail and calibration files not read). One major finding survived, so the round cannot pass. Trajectory: consistent (narrow evidence: pattern subsets only).
- F-1 major: `3a97d017b` removed the only writer of the legacy per-repository key-directory pointer, while the protected local push scratch route (`harness/scripts/pipeline-state.mjs` `repoScopedPushKeyAnchor` ~4513-4532) still takes its anchor only from that pointer → `CRITICAL-PROOF-LOCAL-ANCHOR-UNAVAILABLE` for any repository set up after the commit (fail closed, functional regression the delta predicted: `r7-6-multi-key-aa.md:35-36`, G2).
- F-2 minor: test-list 12's second clause ("handed-over commands carry no `--directory`") has no pin while the R7-6h label claims it (`po-human-approval.test.mjs:5171`, `:5176`).
- Registry: F1 not resolved; F2 resolved for the typed repair (pipeline-state catalogue entry out of range); F3, F4 (this file), F5, F6 resolved; F7, F8 out of range.
- Disposition: Elephant ruling (12) — F-1 is closed only together with the protected `pipeline-state.mjs` change (local push scratch route and approve-push anchor read the machine plane through `resolvePoKeyDirectory` with the pair check), authored as signed-package slice R7-6-P and signed in tranche 1; no candidate is stamped between `3a97d017b` and that tranche. F-2 → test-only R7-6-T15. Delta 2 after both.
