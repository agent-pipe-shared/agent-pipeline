---
schema: pipeline.backlog-item.v1
id: pipeline.dead-key-directory-pointer-is-permanent-and-silent
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking at the last touch: on a machine that HAS a valid PO key, a freshly onboarded project still gets no trust anchor, so the signature push the PO is asked to perform is functionless."
source: "Measured 2026-08-28 on the development machine itself, while reconciling the trust-anchor item: freshCriticalHumanProofPolicyBytes(fs) returned a bare v1 document on a machine whose key directory exists and is complete. Probed step by step (scratch/probe-machine-plane.mjs) rather than inferred."
---

# A dead `poKeyDirectory` pointer is both permanent and silent, so a machine with a key onboards as a machine without one

## What was measured

`freshCriticalHumanProofPolicyBytes(fs)` was run against this machine, which owns a
complete, working PO key — the same key that signed a real push-approval ceremony
earlier the same day. It returned:

```
schema        : pipeline.critical-human-proof-policy.v1
requiredKinds : ["push"]
trustAnchors  : 0
```

A bare v1 seed: exactly the "no machine key exists yet" fallback. The key exists.

Probing `detectExistingLocalTrustAnchor()`'s four stops one at a time located it
precisely:

| step | result |
| --- | --- |
| machine plane status | `valid` |
| `poKeyDirectory` recorded | yes |
| `trust-policy.json` at that directory | **absent** |

The recorded directory is a temporary path from a past test run (`/tmp/po-human-key-…`),
long since evaporated. The real key directory sits elsewhere and does contain a
well-formed `trust-policy.json`.

## Why it is permanent

`recordPoKeyDirectory()` (`scripts/po-human-approval.mjs`, ~line 87) is first-write-wins
by explicit design:

```js
if (current?.poKeyDirectory === directory) return;
if (current && text(current.poKeyDirectory)) return;
```

Its own comment gives the reason, and the reason is sound: a later call must not silently
redirect a DIFFERENT already-valid directory a human previously chose. But the predicate
it actually implements is "a string is present", not "a valid directory is present". A
dangling pointer to a directory that no longer exists is not a human's deliberate choice
being protected — it is a dead reference being preserved forever, and nothing in the
system can replace it.

## Why it is silent

`detectExistingLocalTrustAnchor()` returns `null` for all four of its stops alike: no
machine plane, no recorded directory, no `trust-policy.json` at the recorded directory,
and a malformed policy file. The caller cannot distinguish "this machine has no key yet"
— genuinely correct, and the case the v1 fallback exists for — from "this machine has a
key and the pointer to it is broken", which is a repairable fault.

The consequence is the one the reachability class describes: onboarding reports the
correct-looking outcome for the wrong reason, and the PO discovers it only at the
signature, which is the last of the five human touches and the most expensive place to
find out.

## Direction

1. Separate the two cases at the point of detection. A recorded directory that does not
   resolve to a readable `trust-policy.json` is a **broken pointer**, reported as such,
   not folded into "no anchor found".
2. Narrow `recordPoKeyDirectory`'s first-write-wins predicate to what it is actually for:
   preserve a recorded directory that still EXISTS; replace one that does not. A dangling
   path is not a competing human choice.
3. The onboarding seed keeps its current behaviour in the genuine no-key case — bare v1
   plus the guidance action. Nothing here should make an absent key look present.

## Acceptance criteria

- On a machine whose recorded key directory no longer exists but which owns a valid key
  elsewhere, a fresh onboarding either seeds the anchor or reports the broken pointer by
  name. Silence is not an acceptable third outcome.
- A recorded directory that still exists is never replaced by a later call, exactly as
  today — pinned by its own test, because that is the property this change must not break.
- The distinction is measured on a machine with a genuinely dangling pointer, not only
  asserted from unit fixtures.

## Related

- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` — the parent item. Its
  criterion "an existing key directory is detected and reused" cannot be satisfied while
  detection is looking at a dead path; this is why that item measured as unsatisfied on a
  machine that should have satisfied it.
- `2026-08-28-a-v1-trust-anchor-makes-the-signature-push-route-functionless.md` — what the
  bare v1 seed then costs at the push.
- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — the class: the
  mechanism was measured, the deployed path to it was not.
