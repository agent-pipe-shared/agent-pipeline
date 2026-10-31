# w8-signing-presentation-cases-follow-the-path-bound (held patch, not applied)

Cause of the red `signing-disclosure-sweep` cases SDP004 and SDP005 (test-side drift, no product change):

- SDP004 expected a 1000-character material path to be refused. `SIGNING_PATH_MAX_CHARS` is 32767 (long Windows paths are valid), so the case now uses a 40000-character path to exercise the over-length refusal.
- SDP005 built a `PO-HUMAN-CRITICAL-AUTHORIZATION-READY` result with `paths.proof` only. The formatter reads `externalPaths.proof` for that code (the proof lives outside the repository), so the fixture result now carries it and the one-line human output keeps its `proofPath`.

Evidence (clean clone): `signing-disclosure-sweep.test.mjs` 19/19 green. Applies to the repository HEAD.
