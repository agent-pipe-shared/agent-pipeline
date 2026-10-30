# Held patch: follow-up round lineage in session mode (N20, decision D206)

Patch: `w7-n20-session-mode-follow-up-lineage.patch`, written against the stacked candidate (the held D207 patch on top of HEAD
a8f23656c). It stacks on D207: both touch `critic-review-lineage.mjs` and `critic-verify-lifecycle.mjs`.

## Cause (confirmed in code, not only hypothesised)

`session-critic-finalizer.mjs` builds the result session with `id = packet.request.sessionBinding.sessionId` (the hosting session;
`validateResult` binds it). `critic-review-lineage.mjs` `compileRegisteredCriticReviewLineage` then recorded
`lane.laneId = result.session.id` and `lane.contextSha256 = sha256Canonical(result.session)`. Every round of one hosting session
therefore carried the same lane, and `transitionCode` refused any round with a parent (`current.lane.laneId === parent.lane.laneId`).
Round 1 has no parent, so `transitionCode` never ran for it: that is why the first round registered and round 2 or 3 did not.

## Decision and reason

The lane of a round identifies that round's own Critic run. `sessionRoundLane({ session, packetId, packetDigest })` (exported from
`critic-review-lineage-core.mjs`, pure) derives `laneId = round-lane-<40 hex>` and `contextSha256` from the hosting session AND the
packet (packet id and the receipt's packet digest). Reason: the independence rule in `transitionCode` is right and stays byte for byte
as it was (same lane as the parent stays refused); the defect was that the recorded lane was not a property of the round. Deriving
it where the lineage record is built leaves the result schema, the receipt schema and `result.session.id` (bound by the validators)
untouched. The id is a digest shape, so a long session id cannot overflow the 128 character id bound (core `ID`, schema `$defs/id`,
review-economy `CRITIC_SAFE_ID`).

## Changes

- `lib/critic-review-lineage-core.mjs`: `sessionRoundLane`, `legacySessionLane`, `sessionLaneMatches` (one lane derivation, exported);
  `transitionCode` returns `CRL-HISTORY-CHAIN:<conditions>` with every failing condition from `parent-review-id`,
  `previous-sha256`, `review-id-repeated`, `fresh-from`, `lane-id-equal`, `context-equal` (comma separated). The conditions and the
  order of the check are unchanged; only the code carries the names.
- `lib/critic-review-lineage.mjs`: the v2 compiler uses `sessionRoundLane` for the lane of the record it builds.
- `lib/critic-verify-lifecycle.mjs`: `readConsumedCriticCourseResult` (the mirror, reached for every registered history row through
  `critic-course-admission` `consumedHistory`) accepts the derived lane and the legacy lane through the same helper. Without this the
  next admission, delta request or registration would have re-read the new round 2 and refused `CVL-COURSE-RECORD`.
- `lib/feature-package-registration.mjs`: the `FPR-LINEAGE-COMPILE` reason explains the named condition when the code is
  `CRL-HISTORY-CHAIN:...` (the code itself is printed in the reason and as `compileCode`, with no other plumbing).

## Lane builders and the test that pins each

- v2 compile (`compileRegisteredCriticReviewLineage`, from a consumed session result): derived lane. Pinned by
  `critic-course-admission.test.mjs` "N20 (a)" (real consumed rounds 1 and 2 in the same hosting session; round 2 registers, has its
  own lane, and the next admission reads both back through the mirror) and `critic-review-lineage.test.mjs` N20-01/N20-02.
- v1 compile (`compileCriticReviewLineage`): the lane is caller supplied (`input.lane`), no session is read; unchanged. Pinned by
  N20-02 (rounds 1 to 3 of one session with derived lanes), N20-04 (a forged lane equal to the parent is still refused).
- The mirror in `critic-verify-lifecycle.mjs`: derived or legacy lane. Pinned by "N20 (a)" (derived), "N20 (b)" (a lineage registered
  with the legacy lane reads back, so an already registered round 1 or 2 stays valid), "N20 (c)" (a lane that is neither is refused).
- `transitionCode` conditions: N20-05 pins each of the six once plus the combined lane case; N20-03 pins legacy parent then derived
  child.
- `codex-critic-host.mjs` builds no lane (it neither reads `sessionBinding` nor writes a lineage record): unaffected, no change.
- `session-critic-finalizer.mjs`: not changed; the lane is derived where the lineage record is built, so `result.session.id` stays the
  hosting session that the result validator binds.
- `review-economy.mjs` 369-371, 484-485, 570-583 validate a lane (charset, digest, uniqueness, inequality with the parent) and never
  build one: unaffected; the derived id and digest satisfy them.

## Route neutrality (judgment, stated)

DEVIATION from the brief (decided behaviour 1: "native or isolated routes whose session id already differs per round keep their lane
unchanged"). The packet, with `packet.route.adapter`, is in hand at the compiler and at the mirror, but the adapter is an open string
(`critic-packet-preflight.mjs` validates its key only, no enum names a "session mode"), and the only consumed-result reader
(`validateSessionCriticResult` in `readConsumedCriticCourseResult`) accepts the session-critic result shape for every runner. Branching
on the single literal `session-functional-equivalent` would leave any other session adapter name on the broken lane (the defect again,
on another runner), which is the runner-neutrality failure the brief warns about. So the derivation is one pure function of
(session, packetId, packetDigest) with no runner or adapter input: the Claude, Codex and Antigravity routes build the same lane for the
same result. A route whose session id already differs per round still gets a distinct lane per round (its lane id and digest are new
values, not the legacy pair); its retained legacy lane stays valid because the mirror accepts it. A hard split by route would need an
enumerated session-mode adapter set in the packet contract (outside this write scope); say so if the coordinator wants it.

## Compatibility

- An already registered round 1 or 2 with the old lane stays valid (mirror accepts the legacy lane; validators accept any
  well-formed unique lane).
- A consumed but unregistered follow-up round registers after the patch with no new review: the lane is derived from the consumed
  result at registration time.
- Mixed history (legacy parent, derived child) passes `transitionCode`: the two lanes differ in id and digest by construction.

## Tests and scope notes

- The patch also carries cases appended to `lib/critic-course-admission.test.mjs` (CCA080 to CCA082, at the end before the completion
  registration, as the brief's facts instruct). That file is not in the briefed write scope list; the brief's facts and its scope
  statement contradict each other, so the change travels only inside the patch (nothing in the repository tree was edited) and is
  named here. It is a registered suite already (no new test file, no registration needed).
- `critic-review-lineage.test.mjs`: five cases after the existing 20-check assertion, on their own counter (N20-01 to N20-05), so the
  original `assert.equal(passed, 20)` is untouched.
- The suites named in the brief `lib/feature-package-registration.test.mjs` and `lib/critic-review-lineage-core.test.mjs` do not exist
  in the repository; `lib/critic-verify-lifecycle-route.test.mjs` was run in their place as a touched consumer of the lifecycle reader.
- RED before green: CCA080 (the anchor) failed on the original code with `compileCode: CRL-HISTORY-CHAIN` (log `red1`, first run on
  code that had no production edit yet in its loaded modules), and the revert proof (production files reverted, N20 cases kept) fails
  both the unit file (no `sessionRoundLane`) and CCA080. CCA081 (legacy lane stays valid) and CCA082 (a foreign lane is refused) pass on
  the original code too: they pin decided behaviour 3 and the refusal path, they are regression guards, not RED pins.
- Case text changed after implementing (justification): CCA081 first expected `CCA-DELTA-REQUIRED` from the admission after the
  registration. The fixture has no correction commit after the round, so the admission reaches the parent check and answers
  `CCA-PARENT`; the intent is unchanged (the retained legacy lane is read back by the mirror, not refused `CVL-COURSE-RECORD`). CCA082
  was tightened from "not CCA-DELTA-REQUIRED" to "equals CVL-COURSE-RECORD".
- Ordering honesty: the first RED run of the course suite was started before the production edits, but modules load at start, so it
  ran on the original lineage code (its CCA080 refusal text shows the old code without the condition suffix).

## Not changed

- The result and receipt schemas, `result.session.id`, `transitionCode` independence rule.
- `critic-review-lineage.schema.json` (the derived id fits `$defs/id`).
