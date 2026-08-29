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

## Related

- `2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md` — the
  other half; a consumer hits both, and both must land for a push to be possible.
- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` — the onboarding side.
- `2026-08-28-a-fail-closed-rollback-names-no-predicate-so-a-consumer-cannot-fix-it.md` — the
  same silent-refusal shape, fixed today; this is the second instance.
- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — a signature route
  that cannot complete is the exact class that check exists to catch.
