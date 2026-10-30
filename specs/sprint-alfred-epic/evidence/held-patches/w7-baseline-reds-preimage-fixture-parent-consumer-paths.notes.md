# W7: the three baseline reds after candidate 10 (preimage, codex-critic-host CCH136/137, consumer-safe paths)

Held patch: `w7-baseline-reds-preimage-fixture-parent-consumer-paths.patch`, built by the Elephant in a scratch clone
against `63a010302` (PO 2026-10-30: "löse die roten Tests"; the preimage re-recording is covered by that call).
All three were red at `8fc9c8bff` before this patch and are not caused by candidate 10.

| Red | Cause | Change |
|---|---|---|
| `scripts/codex-isolated-critic-protected-preimage.test.mjs` | the baseline `codex-isolated-critic-protected-preimage.v1.json` was last set in `4ea7a86b7` (2026-10-27); seven operator-applied commits changed four protected Critic surfaces since (`fa30ba28a`, `bc522bc7b`, `f89f2a394`, `a31acd0df`, `068ff38cf`, `7ccdcb001`, `8fc9c8bff`) | the four `rawSha256` values re-recorded to the current bytes of `harness/review-protocol.md`, `skills/critic-review/SKILL.md`, `roles/critic.md`, `templates/prompts/critic-review.md`; the other six entries unchanged |
| `harness/scripts/check-consumer-safe-paths.mjs` | the 2026-10-28 project-state record change added a `harness/review-protocol.md` §2.2 citation to the vendored `roles/critic.md` and ADR-0014 | two allowlist entries of the existing vendored-canon class (same reason function as the §2.1 citations); 178 entries, all used |
| `scripts/codex-critic-host.test.mjs` CCH136/137 | (1) `signedPreparedCriticFixture` copied the candidate under the shared `tmpdir()`, which the authority walk refuses (`domain-ancestor-unsafe`); this hid (2) and (3). (2) Since `821cd35c1` (2026-10-25) `createNativeCriticPreparedContextFactory().reconstruct` refuses `CRITIC-FAMILY-REPREPARE-REQUIRED` by design (pinned in `codex-critic-actual-baseline.test.mjs:239`). (3) CCH137's own pre-finalize check compared the bare candidate fingerprint with `protectedBefore`, but the native host records its authority lifetimes and session-authority members in the candidate's `.git/agent-pipeline`; finalize accounts for exactly those registered publications (`expectedOriginalPublicationFingerprint`) and fails on anything else | (1) fixture copy under `nativeContractFixtureParent()` like every other session-authority fixture; (2) QG-04: both cases assert the isolated reconstruct is refused and finalize runs on the original in-process context; (3) QG-04: the pre-check covers the review checkout, ruleset and observers, the candidate is left to finalize, which must still return `reviewPass` |

No production file changes. The new `.git` paths in CCH137 were measured, not assumed:
`agent-pipeline/model-family-host/authority-lifetimes/*.json` (2), `agent-pipeline/session-authority/catalogue.json`,
`members/model-family-host/*.json` (2), `producers/model-family-host.json`.

## Verification (clone)

codex-critic-host 137/137, codex-critic-actual-baseline 1 pass (28 skipped by its own private-parent gate, unchanged),
preimage pass, check-consumer-safe-paths pass and its test 9/9. No revert proof: test, fixture and baseline only.
