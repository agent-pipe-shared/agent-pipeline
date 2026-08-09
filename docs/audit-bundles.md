# Audit bundles

An Audit Bundle is a create-only, offline-verifiable copy of the validated
artifacts of one completed Feature Package. Its manifest binds the exact
candidate commit/tree, every copied byte digest, and the resolved organization
policy digest. It is evidence, not governance authority and not a release or
compliance claim.

Use the explicit local CLI to emit a reviewable plan, build from that plan, and
verify an existing bundle:

```bash
node plugins/pipeline-core/scripts/audit-bundle.mjs plan \
  --repo "$PWD" --manifest specs/<feature>/lifecycle.json \
  --bundle-id <bundle-id> --core-version <core-version> \
  --pack-file <policy-pack.json>
```

Persist the printed plan through an operator-controlled review boundary before
calling `build --repo … --plan-file … --output …`; use `verify --bundle …` for
the offline digest check. Signing remains a separate provider boundary.

The bundle service refuses an invalid package, a missing candidate binding, an
incompatible policy pack, changed source bytes, and an existing destination.
Verification rehashes each bundled artifact and returns `invalid` for a missing
or tampered byte. Signing and long-term retention are separate operations: a
signature can bind bytes but cannot prove legal identity, key custody, trusted
time, or external authorization.

## Threat model

**Assets:** the bundle's `manifest.json` (candidate commit/tree, artifact
path/digest list, resolved `effectivePolicySha256`), the copied artifact
bytes, and an optional detached `signature.json`.

**Threats considered and their mitigation:**
- Path traversal via a crafted `sourcePath`/`bundlePath` — `rootPath` rejects
  an absolute path, a path containing a backslash, or any resolved target
  that escapes the repository root or bundle root
  (`audit-bundle.mjs:16`), and is applied to every artifact source
  (`audit-bundle.mjs:33`) and output path (`audit-bundle.mjs:30`).
- Tampered or substituted artifact bytes — `buildAuditBundle` rejects if a
  source file's live SHA-256 no longer matches the plan's recorded
  `sha256` (`AB-SOURCE-DIGEST`, `audit-bundle.mjs:33`); `verifyAuditBundle`
  independently rehashes every bundled artifact and reports `AB-DIGEST
  <path>` for a mismatch or `AB-MISSING <path>` for an absent file
  (`audit-bundle.mjs:43`).
- Silently overwriting an existing bundle — `buildAuditBundle` is
  create-only: it fails `AB-OUTPUT-EXISTS` if the output directory already
  exists, and writes `manifest.json` with the exclusive `wx` flag
  (`audit-bundle.mjs:31,35`).
- A signature being read as legal identity, key custody, trusted time, or
  authorization — every signature record is stamped `assurance:
  "cryptographic-binding-only"` (`audit-bundle.mjs:67,70,82`), and signing
  itself is create-only (`AB-SIGNATURE-EXISTS`, `audit-bundle.mjs:68`) so an
  existing signature cannot be silently replaced.
- A signature request being forged or re-bound to different bundle content —
  `signAuditBundle` recomputes the current manifest's own signature request
  and requires it to canonically equal the caller-supplied request (with
  only `algorithm`/`signerKeyId` substituted) before signing
  (`AB-SIGNATURE-PREIMAGE`, `audit-bundle.mjs:64`).
- An incompatible or altered organization policy entering the bundle —
  `planAuditBundle` resolves the policy through
  `resolveEffectiveOrganizationPolicy` (which itself validates every pack;
  see `docs/organization-policy-packs.md`) and binds
  `effectivePolicySha256 = canonicalSha256(policy)` into both the plan and
  the manifest (`audit-bundle.mjs:23,26,34`).

**Out of scope:** filesystem-level access control on the bundle directory
(who can read a built bundle) and transport/storage of a bundle once it
leaves the repository are operator responsibilities, not something this
module enforces.

## Bundle policy

A bundle's contents are fixed at `planAuditBundle` time from a validated
Feature Package's manifest artifacts
(`validateFeaturePackage`, `audit-bundle.mjs:22`) — the plan is not something
an operator hand-edits; every `artifacts[].sha256` in the plan comes from the
package manifest, and `bundlePath` is deterministically derived as
`artifacts/<3-digit-index>-<artifact-class>`
(`audit-bundle.mjs:18,25`). `buildAuditBundle` then only ever copies exactly
those bytes after re-verifying each digest, and writes one `manifest.json`
binding `bundleId`, `candidate` (commit/tree), `effectivePolicySha256`, and
the artifact list (`audit-bundle.mjs:29-37`). `verifyAuditBundle` is fully
offline and re-derives its own findings from the bundle's own bytes — it
does not trust any value it did not itself recompute
(`audit-bundle.mjs:39-45`). Signing (`planAuditBundleSignature` /
`signAuditBundle` / `verifyAuditBundleSignature`) is an explicit, separate,
provider-neutral step layered on an unchanged, already-built bundle; no key
or key location ever enters the bundle content itself
(`audit-bundle.mjs:54-83`).
