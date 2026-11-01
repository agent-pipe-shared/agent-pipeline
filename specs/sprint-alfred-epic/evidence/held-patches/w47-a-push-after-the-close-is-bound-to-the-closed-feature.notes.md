# w47 — a push after the feature close is bound to the closed feature (16d close hotfix)

Found by the second real consumer close: the Critic-bound Verify and the Security scan were green, but `push-init` refused with
`no active feature with an id and planPath in pipeline state`. `close-feature` clears the active feature and the plan authority
(`planApproval.poGateAuthority`) from State, and every layer of the push proof depended on both: `push-prepare` read `activeFeature` to build the
`authorize-critical` command, `approve-push` compared the signed intent with `activeFeature.id` and the plan/spec digests of the plan authority, and
the push guard rebuilt the same intent. There was no sanctioned route to push a closed feature (PO decision 2026-11-01: build the closed-feature
path; install only on the PO's word).

## Change

- `lib/critical-action-authorization-read.mjs`: `criticalActionAuthority({ state, kind, candidate, projectDir })` is the single place that says which
  feature id, plan digest and spec digest a signed critical action is bound to. With an active feature it returns exactly what the code used before.
  With NO active feature and only for `kind === "push"`, it takes the most recently closed feature (`closedFeatures`, valid id, safe `.md` plan path,
  hex `forCommit`, unique latest `closedAt`; an ambiguous latest yields nothing), requires `forCommit` to be an ancestor of the push candidate, and
  hashes the PRD and the sibling `spec.md` from the candidate's own tree (`git show <candidate>:<path>`). Anything else yields no authority and the
  caller refuses as before. `verifySignedAction` uses it (new optional `projectDir`), and `authorizeRecordedPush` passes the project directory.
- `scripts/pipeline-state.mjs` (`approve-push` proof verification): uses the same helper instead of reading `activeFeature` and the plan authority
  directly; the intent comparison and the refusal codes (`CRITICAL-PROOF-STATE`, `CRITICAL-PROOF-AUTHORITY`) are unchanged.
- `scripts/push-prepare.mjs` (`resolveFeatureContext`, used by `push-prepare` and `push-init`): without an active feature, the closed feature that the
  helper selects for HEAD supplies id, PRD path and sibling spec path (`closedFeature: true`); otherwise the refusal now names the closed-feature
  condition. An active feature slot, even a broken one, never falls back.
- Docs: a section in `docs/push-release-flow.md` and its vendored copy.
- Tests in existing suites: five-way coverage in `critical-action-authorization.test.mjs` (CF1 authorizes; CF2 refuses other digests, another
  feature id, a foreign close commit, an unsafe or missing plan path, an ambiguous latest `closedAt`, an active feature, a missing spec and any other
  kind, and lets the latest `closedAt` win), one test in `push-prepare.test.mjs`, and a real-signature `approve-push` section in
  `critical-human-proof-gate.test.mjs`. A mutation removing the ancestor check fails CF2.

## Added to 16d at the PO's request: the cleanup receipt is produced, and the closing session does not count

Found by both consumer closes: `pipeline.close-cleanup-receipt.v1` had no producing command, and the digest consumers chose (the hash of a stored
`session-cleanup.mjs status` output) listed the closing session's OWN descriptor as `unavailable`. A session that is still running cannot answer for
itself, so that hash proved nothing about cleanup (PO: "the own one must not count, only the others").

- `lib/close-cleanup-receipt.mjs` (new): `buildCleanupReceipt({descriptors, ownSessionId, candidateOid, candidateTree})` is a pure function. The own
  descriptor is excluded and named in the observation; every other active descriptor counts. `complete` only with no other descriptor, otherwise
  `uncertain` (which `closed-local` still refuses with `CLOSE-CLEANUP`). `evidenceDigest` is the SHA-256 of the canonical observation, which binds the
  candidate, the named exclusion and the other descriptors with their owner status; order of listing does not matter.
- `scripts/close-coordinator.mjs`: new command `write-cleanup-receipt --root --lifecycle`. It reads the stored coordinator (refuses unless the phase can
  move to `cleanup-complete`, `CLOSE-CLEANUP-PHASE`), lists the descriptors and their owner status (same calls as `session-cleanup.mjs status`), derives
  the own descriptor id from `CLAUDE_CODE_SESSION_ID` (`claude-<id>`, never typed), and writes `cleanup-observation.json` and `cleanup-receipt.json`
  (mode 0600) into the lifecycle's private evidence directory. The coordinator's own acceptance rules are unchanged.
- `skills/close-feature/SKILL.md`: the receipt paragraph now names the command; the hand-written empty-input route stays accepted.
- Tests (existing suite `close-coordinator.test.mjs`): pure-function coverage (own only, none at all, other live, order independence, own not derivable,
  changed status changes the digest, invalid input) and a CLI chain to `closed-local` with the produced receipt. A mutation that stops excluding the own
  descriptor fails the first test.

Limits, disclosed: the own session is derived for the Claude runner only; for another runner nothing is excluded, so a receipt cannot be `complete`
while any descriptor exists (conservative). Stale `claude-*` identity descriptors of ended sessions count as other sessions and make the receipt
`uncertain` until cleared. The producer is not independently Critic-reviewed (Critic paused). Not run on a native Windows consumer.

## Deviation from the design draft

The draft proposed a distinct policy revision (`critical-human-proof-v1-closed-feature`) for the closed case. Not built: the signing side
(`authorize-critical`) already signs whatever feature id and plan/spec files it is given, so a distinct revision would have meant changing the
signer, the request builder and the request verifier as well (six security-sensitive files instead of three). Replay across the two cases stays
excluded by the feature id, the plan/spec digests (State authority versus candidate tree) and the subject digest. Open for the PO to veto.

## Not proven here

- No real push, no real `authorize-critical` ceremony on a consumer; the D227 real-signature proof is still open. The tests sign with a test key.
- An independent Critic review of this signature-verification change is outstanding (Critic paused by the PO).
- A feature closed with a `planPath` that is not a `.md` file under the repository, or a spec that is not the sibling `spec.md`, is not covered.
- Only the most recently closed feature can carry a push; pushing an older closed feature after a newer one closed is not supported.
