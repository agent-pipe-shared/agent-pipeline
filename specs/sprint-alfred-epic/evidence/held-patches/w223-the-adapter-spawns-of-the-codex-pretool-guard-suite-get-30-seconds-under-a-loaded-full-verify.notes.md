# w223 — adapter spawns of the codex pretool guard suite get 30 seconds under a loaded Full Verify

- Found by: Full Verify 2 of the 19e chain (1176 steps, 1 red): `codex-pretool-guard-tests` cases 8 and 15 failed with `null !== 0` (child status null = the spawn timeout ended the adapter). In Full Verify 1 case 8 failed the same way.
- Evidence it is load, not a defect: the whole suite is green alone in the rehearsal chain and in the fix clone, with and without the 19e patches; a single adapter start already takes seconds alone, so 8 s has little headroom when many suites run at once.
- Change: default spawn timeout of the suite's `run()` 8 s -> 30 s (still below the 45 s production hook timeout; explicit longer timeouts are untouched). No assertion changes.
- File: `plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs` (test only; independent of w219/w221).
