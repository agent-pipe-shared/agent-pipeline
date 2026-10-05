# Full Verify evidence, 2026-10-05

Machine-written summaries of two full Verify runs; absolute path prefixes were redacted to `<clone>/`, otherwise
the JSON is unchanged.

- `ic2b-candidate.json` — IC-2b = commit af3dd8dc9, candidate mode, native Linux clone in WSL: 746 suites,
  ~8 min wall time, 37 red.
- `ic2a2-baseline.json` — IC-2a2 baseline = commit 5ffa4aee0, stopped after 714 suites because
  `nova-verify-journal` hung (SIGINT case).
- Result: no IC-2b regression versus the baseline.
