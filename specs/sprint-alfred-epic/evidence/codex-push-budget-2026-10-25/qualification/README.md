# G35 qualification

Source commit 7502188dad20864399843d08e610686b3ada3f0b contains the exact two qualified file hashes in [custody](custody.json). The normal commit passed active hooks; no operator bypass was used.

The actual candidate adapter with a disposable delayed push-guard child rejects the old eight-second budget, allows a 9.2-second child with exit0 and empty stdout/stderr, and denies a 30-second child at its bounded timeout. The test substitutes the push child only; it is controlled adapter coverage, not a real signed push. Production allocation is 24 seconds with eight seconds reserved, within the unchanged 42-second total. Other guards keep their existing defaults. Budget exhaustion has deterministic math/source coverage, not a separate elapsed 42-second integration run.

The final focused RED/GREEN/hung and budget checks pass. The historical broad run was 27/39: twelve fixture-transition assertions expected architecture-design-required and received design-authoring-required. It preceded final focused-test changes, was not rerun, and is not baseline-proven. Original shared assertions were preserved. No full-suite PASS, installed-runtime acceptance, fresh signature, or remote delivery is claimed.

Install and restart the actual Codex host before testing the repaired live adapter. The previous signature binds only the previous candidate. Follow [current handover](../../../../../docs/state.md) for the local course; no PC transfer or feature close is planned.
