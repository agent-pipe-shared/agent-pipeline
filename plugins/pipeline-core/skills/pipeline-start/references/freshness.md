# Freshness, calibration and handover (lazy)

Repository freshness and Pipeline update availability are separate channels;
consumer projects default to `stable`, self-repository may explicitly select
`alpha`, and `--channel beta` requires its own digest-bound plan/apply gate.
Read calibration/denies, handover/state and Verify availability fully; report
unknown/unavailable honestly. A stale candidate, drifted authority, malformed
handover or unavailable Verify blocks confirmation.

