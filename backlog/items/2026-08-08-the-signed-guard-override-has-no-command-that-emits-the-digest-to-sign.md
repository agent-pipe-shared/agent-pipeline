---
schema: pipeline.backlog-item.v1
id: pipeline.signed-guard-override-has-no-command-that-emits-the-digest-to-sign
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-17
closure_repository: self
closure_commit: 9c6bc9230a62cc580383f3803d59d26939bb7900
closure_evidence: backlog/items/2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md
created: 2026-08-08
due: 2026-08-15
source: "Found while walking the signature-mode HGO flow end to end for the GS-2 migration of project/critical-human-proof.json, 2026-08-08. The flow is walkable by reading library source, not by following the CLI."
---

# `signature` mode's guard lift has no command that produces the digest the human signs

## What the ADR promises and what the CLI provides

[ADR-0059](../../docs/adr/0059-signed-human-guard-override.md) Decision 1 states the
human's part precisely:

> The PO's manual action is exactly: inspect the prepared request's digest, sign it
> externally, hand back the proof.

`scripts/guard-human-override.mjs` exposes exactly five commands — `verify-audit`,
`plan`, `prepare-authorization`, `authorize`, `authorize-by-signature`. None of them
emits the digest the human is supposed to sign.

`prepare-authorization` returns a `selectionSha256`. That is **not** the digest. The
signing recipe is a doc comment in the library
(`lib/human-guard-override.mjs:1794-1801`): build a `createPoApprovalIntent` with
`kind: "guard-override"`, `featureId: "human-guard-override"`, two internal constants
(`HGO_SIGNATURE_INTENT_PLAN_SHA256`, `HGO_SIGNATURE_INTENT_SPEC_SHA256`), the
repository's `head`/`tree` from the plan, `policyRevision:
"human-guard-override-signature-v1"`, `subjectSha256: selectionSha256`, and
`decision: "authorize"` — then take its `.sha256`.

So the only route from "prepared" to "signable" runs through reading library internals
and reconstructing an intent by hand. For the default mode of the default posture.

## The second half: signing it is a blind signature

`po-human-approval.mjs sign-intent` is the command that actually uses the key, and it
deliberately refuses to authorize a bare digest — it resolves the record behind the
digest and shows its reason, scope and expiry (ADR-0061 Decision 4). That resolution
goes through `describeGuardMaintenanceWindowRequest`, which resolves **GMW** requests.
An HGO selection does not resolve, so the human lands in the fallback branch:

> no recorded request resolves for this digest in this repository … this command has
> no description of that action and will not invent one.

The command is behaving correctly and saying so honestly. But the result is that the
one path ADR-0059 designed for `signature` mode ends with the human signing a number
whose meaning the signing tool cannot describe — which is exactly the property
ADR-0061 Decision 4 was written to eliminate.

## Why this matters now rather than eventually

`signature` is the default and this repository's committed value, and the setup design
(`specs/sprint-nova-epic/plans/nova-setup-bootstrap.md`) keeps it as the recommended
posture for new machines. Every guard in this family is supposed to be liftable — that
is ADR-0059's standing principle, quoted from the PO: *"alle Sachen die den Agenten
blockieren müssen mit human Signatur oder chat je nach config Liftbar sein."*

A lift that requires reading library source to compute an argument is liftable in
principle and not in practice. The first external tester who hits any GS-rule in
`signature` mode hits this.

## Direction, not a design

1. **One command that emits the signable digest**, as part of or alongside
   `prepare-authorization` — the same value `authorizeHumanGuardOverrideBySignature`
   already computes internally at `lib/human-guard-override.mjs:1850`. The code to
   produce it exists; it is simply not reachable from outside.
2. **Teach the describer to resolve HGO selections**, so `sign-intent` can show what
   is being authorized — the eligible paths, the denying guard's rationale, and the
   expiry are all already in the prepared selection's `decisionPreview`.
3. **Then walk the whole flow once from the CLI alone**, with the library closed, and
   fix whatever that surfaces. This item exists because that walk had not been done.

## Reproduced, 2026-08-09

The predicted scenario in "Why this matters now rather than eventually" above
happened, almost verbatim: the PO's private Claude+Pipeline 0.5.4 happy-path
test run hit a `push` approval that needed `project/critical-human-proof.json`
bootstrapped in `signature` mode (fresh project, no such file yet), fell into
exactly this HGO ceremony, and needed 4 of the session's 8 human terminal
commands plus 2 harness-classifier denials (blocking even a read-only `Read`
of `guard-human-override.mjs`) to walk it — roughly 12 of a 42-minute
push-approval phase. Detailed reconstruction (sanitized, no PO-identifying
data): the turn-efficiency root-cause analysis this same day. See also the new
`project/critical-human-proof.json`-materialization gap filed separately as
`2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`,
which would remove the need for this ceremony to run at all in the push case.

## Related

- `docs/adr/0059-signed-human-guard-override.md` — the promise.
- `docs/adr/0061-uniform-human-approval-ceremony.md` — the "never authorize a bare
  digest" rule this currently defeats.
- `2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`
  — same family: a rule that holds on paper and is only discovered to be unwalkable
  when someone actually walks it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, stays open in current backlog — not deferred.
  `signature` is this repository's own configured `gates.push_approval`
  value (ADR-0056; see CLAUDE.md's Push policy section), so this gap sits
  directly in the ceremony this checkout will itself need to walk for its
  own eventual push, not only in a hypothetical external adopter's path.
- **Rationale:** the item's own "why this matters now" argument (first
  external tester in `signature` mode hits this) applies equally to this
  repository's own next push; not urgent enough to interrupt today's
  backlog-triage pass, but should not be deferred to a later Sprint either.
  Same ceremony family as `2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`
  — worth designing/fixing together rather than separately.
- **Assignment (if accepted):** unassigned; surface both this item and its
  sibling before this repository's own push-approval ceremony is next
  walked for real.
- **Date:** 2026-08-17

### PO decision, 2026-08-17

Build now, together with the sibling item
`2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`,
as one consolidated single-entry-point ceremony (per that item's own
"Direction" section) — before this repository's own next push.

**Correction, 2026-08-17 (later the same day):** the "Dispatched." note above
was written prematurely — no dispatch record or commit for it exists.
Actually dispatched now as `NVA-SIGENTRY-1`, scoped to this item's own core
ask (extract the shared intent-building recipe, add a CLI command that
emits the signable digest, teach the signing describer to resolve an HGO
selection) — the single-entry-point wrapper script and the sibling item's
disclosure/robustness findings are explicitly out of this dispatch's scope,
tracked as follow-ups.

## Closure (2026-08-17)

`NVA-SIGENTRY-1` landed this item's core ask directly: `guard-human-override.mjs`
gained `emit-signature-digest --repo --request-sha256 --plan-sha256 --reason`,
which runs `plan` + `prepare-authorization` and prints the exact digest
`authorizeHumanGuardOverrideBySignature()` gates on — the same value, proven
by a test that arms a real capability from the CLI's own printed digest, via
a shared extracted helper (`buildHumanGuardOverrideSignatureIntent()`) so
there is exactly one implementation of the recipe, never two to drift
apart. The blind-signature half (`sign-intent` describing an HGO digest) is
also done, closing this item's finding 2/Direction 2 ask as a side effect —
see the sibling item's own closure-progress note.

Independently re-verified: `node --test
plugins/pipeline-core/lib/human-guard-override.test.mjs` (38 pass, 5
pre-existing unrelated `HGO-EXTERNAL-MARKETPLACE` failures, confirmed
identical on the pre-dispatch baseline), `node --test
plugins/pipeline-core/scripts/guard-human-override.test.mjs` (9/9), `node
--test plugins/pipeline-core/scripts/po-human-approval.test.mjs` (60/60).
Commits `2da8cf32dcb13de7f697a4b7c7d3bfaa94eaedcb` (extracted helper),
`9c6bc9230a62cc580383f3803d59d26939bb7900` (`emit-signature-digest`),
`97bb2ee2ed0f34ff7522c7e987fd8c733c68d721` (describer wiring).

Still needs Critic review before being considered fully done (security-tier
per MP-07) — not yet scheduled. The unified single-entry-point wrapper
script (chaining plan→prepare→sign→install→verify as one command) remains
explicitly out of scope, tracked as its own future follow-up.
