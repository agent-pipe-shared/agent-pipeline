# w49-b — three refusals name their cause and the next step (candidate 17, slice 3)

Independent of w49-a (different files; both apply to the same base). Found by the Toolbox consumer while trying to push after a close.

## Change

- `scripts/session-critic-finalizer.mjs`: `SCF-TAKEOVER-IDENTITY` was a bare code ("Session Critic finalization is invalid."). New exported
  `takeoverIdentityDetail(featureId, code)` puts the reader's own code (`resolveRegisteredCriticCourseIdentity`) and the two known situations in the
  message (content commits after the last registered round; a closed feature whose course takes no review) and names the way out: a new feature of
  rigor 1 with a full Critic over those commits, no history rewrite. The text does not claim which of the two applies; the code says it.
- `scripts/critic-dispatch-preflight.mjs`: `CDP-EVIDENCE-REQUIRED` now carries a `reason`: the exact candidate, `--evidence <file>`, the Verify
  producer (`--mode critic`) and the Critic diagnostic producer, and that security evidence is not admitted. The CLI prints the reason like
  it already does for `CDP-EVIDENCE-MODE`.
- `scripts/close-coordinator.mjs`: `write-cleanup-receipt` at `closed-local` or later still refuses `CLOSE-CLEANUP-PHASE`, and now says that
  cleanup is behind the lifecycle, that there is no way back, that the receipt recorded at `cleanup-complete` stays the close evidence, and
  that nothing was written.
- Tests (existing suites): `critic-course-admission.test.mjs` (the detail text and that the refusal passes the reader's code),
  `critic-dispatch-preflight.test.mjs` (reason content, and the pinned CLI protocol test now expects the reason key for this one rejection),
  `close-coordinator.test.mjs` (late refusal text, recorded receipt untouched).

## Not changed

- The push-init verify remedy already carries the release-mode route for a Critic-bound push (N24); not touched.
- The Critic preflight's `CDP-EVIDENCE-MODE` text already named the producer; not touched.

## Not proven here

- The takeover refusal was not run against a real closed course (the real cause for the Toolbox case is not read); the text is unit-checked.
- No Full Verify on the applied tree; batch Critic stays paused for this repo.
