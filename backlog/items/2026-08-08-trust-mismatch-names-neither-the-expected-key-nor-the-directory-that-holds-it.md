---
schema: pipeline.backlog-item.v1
id: pipeline.trust-mismatch-names-neither-key-nor-directory
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Hit live on 2026-08-08 when the PO signed a maintenance-window intent from the wrong one of two same-named key directories. The signature was cryptographically sound; the install refused with a five-word code that named nothing. Diagnosing it took the agent four read-only steps that the tool could have done itself."
due: 2026-09-07
---

# `PO-APPROVAL-TRUST-MISMATCH` names neither the key it expected nor the directory that holds it

## Description

`guard-maintenance-window.mjs install` refused a correctly-signed proof with
exactly this output, and nothing else:

```
GUARD-MAINTENANCE-WINDOW-FAILED: PO-APPROVAL-TRUST-MISMATCH
```

The cause was real and the refusal correct: **this machine carries two PO key
directories, and the repository pins the other one.**

| Directory | `trust-policy.json` `publicKeySha256` | pinned by this repository |
| --- | --- | --- |
| `<a>` | `f1e6c705…` | no |
| `<b>` | `f28988b2…` | **yes** |

Both declare `keyReference: "local-po-key"`, so the reference field does not
discriminate — which `docs/po-human-approval.md:70-75` already warns about in
prose. The human had no way to see which directory was the right one, and the
tool did not say.

## What the tool knew and did not print

At the moment it failed, `verifyPoApprovalProof`
(`plugins/pipeline-core/lib/po-approval-proof.mjs:35`) held **both sides of the
comparison**: the digest of the presented key and the digest the trust anchor
requires. It returned a bare code and discarded both.

Reconstructing what it could have said took four read-only steps: read the
anchor from the policy file, read the presented proof's key, hash the candidate
directory's public key, then search the home directory for other
`trust-policy.json` files. **Every one of those is derivable from data the tool
already has or can reach**, and the last one — locating the directory whose
policy matches the anchor — is the single most useful sentence it could print.

## Why this is worth more than its size

The PO's standing rule for this pipeline is measured in *how many commands a
human runs, and how often*. A signing step that fails with an unexplained code
costs a full round trip and, worse, invites the reasonable-but-wrong conclusion
that the key or the passphrase is broken. In this instance the human's reaction
was that the surrounding flow is bad UX, and that was the correct reading of it.

The failure is also **silently recoverable in the wrong direction**: nothing
stops someone from concluding the anchor is stale and "fixing" it to match the
key they happen to hold — which would repoint the repository's trust anchor at
an unintended key while every gate continued to report success.

## Affected artifact

`plugins/pipeline-core/lib/po-approval-proof.mjs:35` (the discarded comparison);
`plugins/pipeline-core/lib/critical-action-authorization.mjs` (the code-prefixing
wrapper that surfaces it); `plugins/pipeline-core/scripts/guard-maintenance-window.mjs`
(the caller that prints the bare code). The prose warning that anticipates this
exact case is `docs/po-human-approval.md:70-75`.

**Ownership note:** these modules belong to the Nova session, and Nova has
further changes in flight in this area. This item is a filing. **The PO has asked
that the repair wait until Nova's current work has settled**, so it should not be
picked up as a drive-by fix — recorded here so the finding survives the wait.

## Proposal

**Owner: PO**, for assignment to Nova once its current work settles.

1. **Print both digests on mismatch.** "expected `f28988b2…`, got `f1e6c705…`"
   turns an unexplained refusal into a diagnosis. This is a message change with
   no security consequence — a public-key digest is not a secret, and it is
   already committed in the repository's own anchor file.
2. **Name the directory that would work, when one can be found.** The signing
   commands already take `--directory`; a mismatch handler that scans the
   directories it has been pointed at during setup — or simply says "no
   configured directory matches this repository's anchor" — removes the guessing
   entirely.
3. **Say that more than one directory exists, if it does.** The prose warning in
   `po-human-approval.md` fires only for a reader who already suspects the
   problem. The tool is the right place for it, at the moment it matters.
4. **Do not "fix" this by relaxing the anchor comparison.** Stated explicitly
   because the fastest route from red to green here is to make the anchor follow
   whatever key showed up, and that would convert a correct refusal into a
   silent acceptance of an unintended signer.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
