---
schema: pipeline.backlog-item.v1
id: pipeline.v1-trust-anchor-makes-signature-push-functionless
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — critical: it makes gates.push_approval 'signature', the documented default and this repository's own setting, functionless. Stacks with the push-gate item; a consumer hits both."
source: "Consumer project HA, incident report S56 finding B8 (2026-08-28, Windows), added after the first handover. Both mechanisms re-verified in this repository's own code before filing."
done_when: manual
---

# A v1 trust anchor makes the signature push route functionless, and two readers of the same file disagree

## What happens

The consumer's `project/critical-human-proof.json` is what onboarding wrote:

```json
{ "schema": "pipeline.critical-human-proof-policy.v1", "requiredKinds": ["push"] }
```

A complete, correct signature ceremony then runs: `authorize-critical` signs, `approve-push`
accepts the Ed25519 proof and records `pushApproval.lastApproved` with a valid
`proof`/`intentSha256`. The push is still refused.

`trustAnchorsFor()` (`lib/critical-action-authorization.mjs`, near line 142) returns
`{ ok: false, code: "PUSH-PROOF-TRUST-ANCHOR-MISSING" }` for a v1/v2 document carrying no
`trustAnchor` — deliberately, per its own comment: that route is unavailable. Only a **v3**
document with a `trustAnchors` array yields the any-well-formed-key posture. Pinned by
`critical-action-authorization.test.mjs`, so the behaviour is intended; what is not intended
is onboarding writing a document that lands in it.

## The same defect was already found and fixed — in the sibling reader only

`human-guard-override.mjs` carries a comment at its own trust-anchor resolution recording
exactly this failure: a project with a v3-only `trustAnchors` set had "every signed
admission failed with `HGO-TRUST-ANCHOR-MISSING`", fixed as NVA-HGOFIX-1 and pinned by two
tests, including one asserting an EMPTY v3 array still fails closed rather than becoming
any-well-formed-key.

So one of two sibling readers of the same policy file was repaired and the other was not.
That is the most useful fact in this item: this is not a novel failure mode, it is a known
one that was closed in one place.

## The refusal says nothing, which is where the diagnosis time went

`guard-push.mjs`, at the attestation call site:

```js
if (attested.authorized === true) return true;
```

The result's `code` is discarded. A refusal caused by `PUSH-PROOF-TRUST-ANCHOR-MISSING` is
therefore indistinguishable from any other unattested push, and renders as "no such proof
verified here". The consumer could only establish the real cause by calling
`authorizeRecordedPush()` directly. Same shape as the rollback-predicate defect fixed
earlier today: a fail-closed path that names no predicate.

## Two readers of the same file disagree

`push-prepare`'s `critical-human-proof-policy` check reports, for this exact v1 document,
`posture: unrestricted (any well-formed key may sign)` — green. The authorization path reads
the same file as "route unavailable". An operator sees a green pre-flight check and then a
silent refusal. Either reading may be the right one, but they cannot both be.

## Secondary, smaller, and separately real

`attestedMainPublication()` returns early when `binding.destination !== "refs/heads/main"`.
`git push origin main` yields `destination: null` while the outer condition still recognises
it as a main push, so that form can never pass attestation — although the comment directly
above puts the short form "on the same footing as the fully-qualified `git push origin
main:refs/heads/main`". Both forms were tested live at the consumer; both refused.

## Direction

1. Onboarding writes the anchor as **v3 with an explicit `trustAnchors` array**, or the first
   `authorize-critical` records the public key it used. Whichever, a freshly onboarded
   project must not land in the unavailable-route branch.
2. `attestedMainPublication()` passes the code from `authorizeRecordedPush()` into the guard
   message. The silent refusal cost the majority of the diagnosis time.
3. `push-prepare` and the authorization path resolve v1 documents with the **same** semantics.
   A test should assert the two agree, on the same fixture, rather than each being correct
   alone.
4. Either support the short-form refspec or name it in the guard message.

## Acceptance criteria

- A freshly onboarded project completes a signature push end to end, measured against an
  installed-plugin deployment.
- A refusal caused by a missing or unusable trust anchor names that cause.
- A test drives one fixture through both readers and asserts they agree.
- The empty-`trustAnchors` case still fails closed, exactly as `human-guard-override`'s own
  test already requires — this must not become an any-well-formed-key posture by accident.

## Closing note — partial (reconciliation, 2026-08-28)

Verified against current code, not from a commit message:

- **Direction 2 (silent refusal names its cause) — landed.** `guard-push.mjs`
  `attestedMainPublication()` (lines 806-852) now returns the specific
  `PUSH-PROOF-*` code, and the refusal message interpolates it
  (`no such proof verified here (${mainAttestation.code})`, line 875).
- **Direction 4 (short-form refspec) — landed.** `mainPublicationAttempt`
  recognizes the colon-less `git push origin main` form and, when the
  destination cannot be resolved, the message names
  `PUSH-PROOF-DESTINATION-UNRESOLVED` and tells the caller to use the
  fully-qualified refspec (guard-push.mjs, ~line 862-885).
- **Direction 3 (the two readers agree) — landed.** `push-prepare.mjs`'s
  `critical-human-proof-policy` check (lines 206-260) now mirrors
  `trustAnchorsFor()` exactly: a v1/v2 document with no `trustAnchor` reports
  `posture: unavailable ... matches PUSH-PROOF-TRUST-ANCHOR-MISSING`, not
  "unrestricted" — the two-readers-disagree defect this item reported is gone.
- **Direction 1 (onboarding bootstraps the anchor) — partially landed.**
  `freshCriticalHumanProofPolicyBytes()` (`lib/project-onboarding-v3.mjs`
  lines 1120-1129) now seeds a v3 document WITH `trustAnchors` when
  `detectExistingLocalTrustAnchor(fs)` finds an existing signing key on this
  machine. But when no local key exists yet — the common case for a
  genuinely fresh onboarding — the seed is still a bare v1 document with no
  trust anchor, by explicit design (a `trustAnchorGuidanceAction` proposes
  the PO add one afterward, but the route stays functionless until they do).
  So the acceptance criterion "a freshly onboarded project completes a
  signature push end to end" is not yet true unconditionally — only when a
  machine key already exists at onboarding time.

Left `status: open` because the onboarding-side gap is real and matches the
item's own acceptance criteria; the guard-message and posture-agreement halves
are done and should not be redone.

## PO decision, 2026-08-29

**Decision:** implement trust-on-first-use for the genuinely-first-ever-key
case — the first `authorize-critical` call records the public key it used as
a trusted v3 anchor, rather than requiring a manual out-of-band PO step.
**Rationale:** PO explicitly chose this over keeping the current
never-auto-trust posture, accepting the trade-off named in the item's own
Direction 1 (a first-access actor could plant their own key) as acceptable
given the accidental-breakout threat model this repository already runs
under (not a determined-attacker model).
**How to apply:** dispatch a goldfish-deep task targeting
`lib/critical-action-authorization.mjs` (trustAnchorsFor's resolution logic)
and `lib/project-onboarding-v3.mjs` (`freshCriticalHumanProofPolicyBytes`,
the still-bare-v1-when-no-local-key branch, ~line 1079) to make the first
`authorize-critical` call, when no trust anchor yet exists, record the public
key it used as a v3 `trustAnchors` entry. Must not weaken the
empty-`trustAnchors`-still-fails-closed case already pinned by
`human-guard-override`'s own test (Acceptance criterion 4). This closes the
Direction-1 gap this item's own closing note left open.

## Landed, 2026-08-29 (dispatch NVA-TOFU-1, commit `85fefb99`)

Implemented as decided, applied SYMMETRICALLY to both `authorizeRecordedPush()` and
`authorizeRecordedDeploy()` (they share one policy file, so pinning only one route would
leave the other order-dependently broken — proved by new test DPA12, a key pinned via the
push route also governs the deploy route). `trustAnchorsFor()`
(`plugins/pipeline-core/lib/critical-action-authorization.mjs`) now returns
`pinOnSuccess: true` only for the genuinely-anchor-less case (no `trustAnchor`, no
`trustAnchors` field at all) — never for a v3 document's explicit empty `trustAnchors: []`,
which stays a permanent "any well-formed key, every time" posture (PPA21 unchanged). New
`pinTrustAnchorOnFirstUse()` writes the verifying key back as a v3 `trustAnchors` entry only
AFTER every other check has passed and the call is actually about to authorize (a proof that
verifies cryptographically but is refused for an unrelated reason, e.g. an unconsumed ledger
entry, never pins) — atomic temp-file/fsync/rename/dir-fsync write, copied from
`pipeline-state.mjs`'s existing durable-write pattern; best-effort and silent on write
failure so a write error never retroactively unauthorizes an already-decided action.

Confirmed untouched: the v3 any-key-forever posture (PPA21), and the human-guard-override
route's own separate empty-`trustAnchors`-fails-closed behavior (Acceptance criterion 4;
`NVA-HGOFIX-1` in `human-guard-override.test.mjs`, still refusing with
`HGO-TRUST-ANCHOR-MISSING`) — a different consumer of the same policy file, deliberately out
of scope.

Verified independently by the Elephant, not only taken from the dispatch report:
`critical-action-authorization.test.mjs` 39/39 (was 36/36),
`human-guard-override.test.mjs` 94/94, `critical-human-proof-policy.test.mjs` 32/32,
`check-consumer-safe-paths.test.mjs` 9/9. Only the two briefed files changed (confirmed via
`git show --stat`).

**Follow-up fix, same session, commit `1b19628e`:** `push-prepare.mjs`'s own
`checkCriticalHumanProofPolicy()` — the reader `trustAnchorsFor()`'s own doc comment names as
existing specifically to mirror it (NVA-N-PUSHDIAG, Acceptance criterion 3 "the two readers
agree") — was out of NVA-TOFU-1's briefed scope and was left reporting the OLD "posture:
unavailable, cannot authorize any key" message for the anchor-less case, which the landed fix
had just made untrue. Left alone this would have silently reintroduced the exact
two-readers-disagree defect this item's own Direction 3 fixed, and would have shown
`push-prepare.test.mjs` red (confirmed: 46/48 before this follow-up, 48/48 after). Fixed by
updating the mirrored diagnostic to `ok: true` with a trust-on-first-use message, and
rewriting the two tests that pinned the old expectation.

Acceptance criterion 3 ("A test drives one fixture through both readers and asserts they
agree") is met by the existing/updated agreement tests in `push-prepare.test.mjs`.
Acceptance criterion 1 ("A freshly onboarded project completes a signature push end to end,
measured against an installed-plugin deployment") was NOT measured this session — only unit-
and fixture-level tests. Status left `open` pending that end-to-end measurement.

## End-to-end measurement, 2026-08-29 (NVA-CF-BL16-TOFUE2E / -RETRY / -PRECISEFIX / -PLANGATEFIX, commits `13e5e541`, `58812cc5`, `fc0561d1`, `4b32ec65`)

Acceptance criterion 1 is now **substantially, but not completely, measured**
by `plugins/pipeline-core/scripts/measure-tofu-push-e2e.mjs`, a real
subprocess-driven walk of a genuinely fresh, disposable repository (no
mocked dependencies except the key-generation step -- see below). Run
independently by the Elephant after the dispatch chain landed, not only
taken from a dispatch report:

```
node plugins/pipeline-core/scripts/measure-tofu-push-e2e.mjs
```

reaches `outcome: "signed-push-recorded"`, exit code 0: fresh onboarding
(7 turns) → a real PO plan-gate approval (submit-plan/present-plan/
approve-plan, including discovering and satisfying a previously-unknown
second precondition, `PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING`) → a real Ed25519
key setup (generated via Node's own `crypto` module rather than shelling
out to an interactive `openssl genpkey`, to avoid a real PEM-passphrase
prompt no automated harness can drive reliably -- the key itself is real
and used for real signing, only ITS OWN GENERATION step is not routed
through interactive openssl) → a real `openssl pkeyutl -sign`-produced
signature over the real subject digest → `approve-push` accepting that
proof and recording `pushApproval.lastApproved.criticalProof` with a real
signature.

**What remains genuinely unmeasured:** the script's own final check reads
`project/critical-human-proof.json` directly off disk after `approve-push`
and reports `trustAnchorPinned: false` (schema stays
`pipeline.critical-human-proof-policy.v1`, no `trustAnchors` written).
Traced directly: `pinTrustAnchorOnFirstUse()` is called only from inside
`authorizeRecordedPush()`, which is called only from
`plugins/pipeline-core/hooks/guard-push.mjs` -- the PreToolUse hook that
intercepts an actual `git push` command. `pipeline-state.mjs approve-push`
(where this script's walk stops) only RECORDS the approval; it never itself
invokes `authorizeRecordedPush()`. So this measurement proves the entire
onboarding-through-signed-approval chain works for a fresh, anchor-less
project, but does not yet prove the pin itself fires, because it never
drives a real `git push` through the guard hook. The underlying pinning
function is separately, thoroughly unit-tested
(`critical-action-authorization.test.mjs`, 39/39 including TOFU-specific
cases, confirmed passing this same session) -- this is a measurement-scope
gap, not a known mechanism defect, but it is not the same thing as having
measured it end to end as Acceptance criterion 1 literally asks.

**Not yet closing.** A future session should either extend this script one
more step (drive a real `git push` to a local/fake remote through
`guard-push.mjs`'s real interception, then re-check `trustAnchorPinned`) or
make an explicit PO call that the currently-measured scope is sufficient
evidence to close this item.

## Critic review, 2026-08-29 (task `wdnfwnx1t`) — two further gaps, one an overclaim already in git history

An independent A/G/S Critic review of the highest-risk backlog-sweep
commits (opus/max, `templates/prompts/critic-review.md`) found two further
issues with this measurement, both independently re-verified by the
Elephant before being recorded here:

1. **A second, previously undisclosed measurement-scope gap.** Acceptance
   criterion 1's own text requires the push to be "measured against an
   **installed-plugin deployment**", not this repository's own checkout.
   `measure-tofu-push-e2e.mjs` resolves every CLI it drives
   (`PIPELINE_STATE_SCRIPT`, `PO_HUMAN_APPROVAL_SCRIPT`) from its own
   module URL inside this checkout (`resolve(fileURLToPath(new URL(...,
   import.meta.url)))`) — it never exercises an installed-plugin
   deployment shape. The "What remains genuinely unmeasured" paragraph
   above named only the `trustAnchorPinned` gap; this is a second, equally
   real gap in the same acceptance criterion that was missed when that
   paragraph was written.
2. **Commit `4b32ec65`'s own message overclaims.** Its body states
   *"Closes acceptance criterion 1 ... live run now reports
   outcome=signed-push-recorded, exit code 0"* — written before the two
   scope gaps above (trust-anchor pinning, installed-plugin deployment)
   were discovered. This repository's own rules forbid rewriting commit
   history, so this cannot be corrected retroactively; recorded here as a
   known, disclosed contradiction between that commit's own claim and this
   item's actual, more carefully assessed state. A reader of `git log`
   alone for this commit would be misled; this item file is the
   authoritative status.

Net effect: **three** things must all be true before Acceptance criterion 1
can honestly be called measured, not one: trust-anchor pinning exercised
via a real `git push` through `guard-push.mjs`, an installed-plugin
deployment shape (not this checkout), and neither is currently true. Left
`status: open`.

## Related

- `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md` — the
  other half; a consumer hits both, and both must land for a push to be possible.
- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` — the onboarding side.
- `2026-08-28-a-fail-closed-rollback-names-no-predicate-so-a-consumer-cannot-fix-it.md` — the
  same silent-refusal shape, fixed today; this is the second instance.
- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — a signature route
  that cannot complete is the exact class that check exists to catch.
