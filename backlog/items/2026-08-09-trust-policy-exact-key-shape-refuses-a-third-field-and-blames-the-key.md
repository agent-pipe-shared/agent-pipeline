---
schema: pipeline.backlog-item.v1
id: pipeline.trust-policy-exact-key-shape-refuses-a-third-field-and-blames-the-key
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "First end-to-end signed push of this repository (8dcb1cc..3387065, sprint_phoenix), confirmed at source in plugins/pipeline-core/scripts/po-human-approval.mjs under dispatch PHX-BL4 (2026-08-09)."
due: 2026-09-08
---

# A trust policy with one unknown extra field cannot sign, and the error blames the key

## Description

`po-human-approval.mjs` validates the external `trust-policy.json` with an
exact-shape check that requires the object to carry precisely `keyReference`
and `publicKeySha256` — nothing more, nothing less. A policy carrying a third
field, `humanName`, was refused even though its `publicKeySha256` digest
matched both the local public key and the committed
`project/critical-human-proof.json` → `trustAnchor.publicKeySha256`. The
error message, `external trust policy does not match the local public key`,
is false in the case that actually occurred: the key matched; the object
shape did not. Two distinct defects, not one: the message names the wrong
artifact (it should name the object shape, not the key), and `setup` writes
a policy it will later refuse instead of rejecting the extra key at creation
time or at first read.

The failure ORDER is correct and must be preserved by any fix: `openssl`
signs the intent digest first, the shape check on `trust-policy.json` fails
second, and the `finally` block deletes the signature before any proof is
written — no half-signed artifact survives a shape mismatch.

## Triggering situation

Verified at source, quoted directly.

The exact-shape check
(`plugins/pipeline-core/scripts/po-human-approval.mjs:25`):

```
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
```

Called with exactly `["keyReference", "publicKeySha256"]` at three sites —
`setup`'s recovery/present-authority branch (line 185), `sign-intent`
(line 231), and `approve`/`approve-critical` (line 255):

```
if (!own(authority, ["keyReference", "publicKeySha256"]) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("existing trust policy does not match the local public key");
```

and (`sign-intent`/`approve`, the failure actually hit):

```
if (!own(authority, ["keyReference", "publicKeySha256"]) || !text(authority.keyReference) || authority.publicKeySha256 !== publicKeyPolicy(publicKey, authority.keyReference).publicKeySha256) fail("external trust policy does not match the local public key");
```

`own`'s `Object.keys(value).length === keys.length` makes a third key —
present or not, matching or not — fail this check identically to a
mismatched digest, and the failure message names only "the local public
key", not the object shape.

`rg -n "humanName" plugins harness docs` returns nothing (checked 2026-08-09)
— the field is inert everywhere in this repository; nothing reads or writes
it. It was present in the external `trust-policy.json` only, outside the
checkout, added by the operator presumably as an unenforced human-readable
label.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs` — the `own()` helper
(line 25) and its three call sites (`setup` line 185, `sign-intent` line
231, `approve`/`approve-critical` line 255); `setup`'s policy-writing branch
(line 179-181) that can produce a policy `setup` itself will later refuse.

## Proposal

Two separable proposals, deliberately not one fix:

1. Distinguish the shape failure from the digest failure in the error
   message — e.g. `"external trust policy has an unexpected field set"` vs.
   `"external trust policy does not match the local public key"` — so the
   operator is pointed at the artifact that actually needs editing
   (`trust-policy.json`), not at the key.
2. Either have `setup` reject an extra key at creation/first read (so a
   malformed policy is never written in the first place), or relax `own()`
   to permit additional benign fields it does not itself require — whichever
   the maintainer judges narrower; this item files the defect and its
   evidence, it does not choose between them.

Preserve the confirmed failure order (sign, then shape-check, then delete
the signature in `finally`) in any fix — that ordering is correct and is not
part of the defect.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
