# Audit Bundle implementation and threat model

This maintainer reference supplements the [consumer guide](audit-bundles.md).
It describes implementation checks, not additional user authority.

## Threat model

**Assets:** the bundle's `manifest.json` (candidate commit/tree, artifact
path/digest list, resolved `effectivePolicySha256`), the copied artifact
bytes, and an optional detached `signature.json`.

**Threats considered and their mitigation:**
- Path traversal via a crafted `sourcePath`/`bundlePath` — `rootPath` rejects
  an absolute path, a path containing a backslash, or any resolved target
  that escapes the repository root or bundle root
  (`rootPath` in `audit-bundle.mjs`), and is applied to every artifact source
  and the output path (`buildAuditBundle`).
- Tampered or substituted artifact bytes — `buildAuditBundle` rejects if a
  source file's live SHA-256 no longer matches the plan's recorded
  `sha256` (`AB-SOURCE-DIGEST`); `verifyAuditBundle`
  independently rehashes every bundled artifact and reports `AB-DIGEST
  <path>` for a mismatch or `AB-MISSING <path>` for an absent file
  (`verifyAuditBundleSync`).
- Silently overwriting an existing bundle — `buildAuditBundle` is
  create-only: it fails `AB-OUTPUT-EXISTS` if the output directory already
  exists, and writes `manifest.json` with the exclusive `wx` flag
  (`buildAuditBundle`).
- A signature being read as legal identity, key custody, trusted time, or
  authorization — every signature record is stamped `assurance:
  "cryptographic-binding-only"` (`signAuditBundle`,
  `verifyAuditBundleSignature`), and signing
  itself is create-only (`AB-SIGNATURE-EXISTS`, `signAuditBundle`) so an
  existing signature cannot be silently replaced.
- A signature request being forged or re-bound to different bundle content —
  `signAuditBundle` recomputes the current manifest's own signature request
  and requires it to canonically equal the caller-supplied request (with
  only `algorithm`/`signerKeyId` substituted) before signing
  (`AB-SIGNATURE-PREIMAGE`).
- An incompatible or altered organization policy entering the bundle —
  `planAuditBundle` resolves the policy through
  `resolveEffectiveOrganizationPolicy` (which itself validates every pack;
  see `docs/organization-policy-packs.md`) and binds
  `effectivePolicySha256 = canonicalSha256(policy)` into both the plan and
  the manifest (`planAuditBundle`, `buildAuditBundle`).

**Out of scope:** filesystem-level access control on the bundle directory
(who can read a built bundle) and transport/storage of a bundle once it
leaves the repository are operator responsibilities, not something this
module enforces.

## Bundle policy

A bundle's contents are fixed at `planAuditBundle` time from a validated
Feature Package's manifest artifacts
(`validateFeaturePackage`, called by `planAuditBundle`) — the plan is not something
an operator hand-edits; every `artifacts[].sha256` in the plan comes from the
package manifest, and `bundlePath` is deterministically derived as
`artifacts/<3-digit-index>-<artifact-class>`
(`planAuditBundle`). `buildAuditBundle` then only ever copies exactly
those bytes after re-verifying each digest, and writes one `manifest.json`
binding `bundleId`, `candidate` (commit/tree), `effectivePolicySha256`, and
the artifact list. `verifyAuditBundle` (`verifyAuditBundleSync`) is fully
offline and re-derives its own findings from the bundle's own bytes — it
does not trust any value it did not itself recompute. Signing (`planAuditBundleSignature` /
`signAuditBundle` / `verifyAuditBundleSignature`) is an explicit, separate,
provider-neutral step layered on an unchanged, already-built bundle; no key
or key location ever enters the bundle content itself.

`verified` means internally consistent, not complete: the verifier checks only
what the manifest names (a manifest without an `evidence` key, an item whose
status is `gap` and an item without a `bundlePath` all verify), and the
README of a new bundle says so. What the bundle must contain is stored nowhere,
so an absent approval cannot be told from one that was out of scope.

## Human approval evidence and the approval trace

A plan may name an optional `evidence` input; `collectEvidence` in
`audit-bundle.mjs` is its one reader. A close names `criticReports` (one entry per
Critic round), an optional `dispatchProjectionPath`, `sbomRecordPath` and
`gateChangesRecordPath`, and `approvalGaps` (below); the four approval keys
`traceReportPath`, `proofPaths` (at most 16), `verifyRecordPath` and
`securityScanPath` (repository relative paths) are named only by a
hand-built request, because no production close names `traceReportPath`,
`verifyRecordPath` or `securityScanPath`. The approval block runs only when
one of those four keys is named, or when no evidence key at all is named. It
carries, by path and digest, the approval
trace report, the detached signature proofs, the release-mode Verify record and
the Security scan record, all bound to the candidate the bundle audits (the
last close commit itself). An item that is not named, unreadable, bound to
another candidate, not a release Verify, or not a passing scan is a typed gap
in the manifest (`NOT-REFERENCED`, `UNREADABLE`, `OTHER-CANDIDATE`,
`NOT-RELEASE-VERIFY`, `NOT-PASSING`), never silently skipped. A plan whose
candidate differs from the package candidate is refused
(`AB-CANDIDATE-MISMATCH`). Without `evidence` the bundle is byte-identical to
before.

`approvalGaps` (candidate 30k, AC-112 binding) is the one key through which a
close names the approvals it could not carry: at most 16 `{ kind, code }`
entries, each turned into an `approval-proofs:<kind>` gap item (item shape
`{item, status, code, bundlePath}`, `status` `gap`, a null `bundlePath`). The
close takes them from `collectAuditProofs` through `auditApprovalGaps`
(`lib/audit-proof-collection.mjs`): a chat-mode plan approval
(`CHAT-ATTRIBUTION-ONLY`), a human-guard override capability (`CHAT-ATTRIBUTION-ONLY` when
every capability is a chat attribution, otherwise `PROOF-NOT-RETAINED-IN-CAPABILITY`)
and a proof that is not carriable (`PROOF-NOT-CARRIABLE`). Only the name of an
absence is carried, never a record of the private store; nothing blocks, no
status is stored, and the verifier is unchanged, so a bundle built before this
key still verifies. A close whose bundle was built before the change and that
is planned again with a gap present finds a different evidence block and is
refused `FCA-OUTPUT-COLLISION` by `planFeatureCloseAudit`; the repair is the
distinct explicit output it names. A close with no gap produces the evidence
block byte for byte as before.

The trace itself is `scripts/human-approval-trace.mjs --repo <root> [--commit <oid>] [--format table|json]`,
a read-only operator command (`--out` writes the JSON report create-only inside
the repository, for the bundle to carry; the guard admits only `--repo`,
`--commit` and `--format`). For a candidate it enumerates the approval records
the gates consumed (push approval, plan and design approvals, critical-action
authorizations, override capabilities, chat-mode attributions) and proves each
chain: the record names the exact candidate or plan digest, a detached Ed25519
proof exists whose signed digest equals that binding, it verifies against the
project's key directory and trust anchor with a registered human key, and it was
consumed once. Verdicts: `traced`; `attribution-only` (a chat-mode approval, an
attribution record and not proof); `untraceable` with the exact break (exit 1).
It never signs, never consumes a proof and never approves anything. Records that
the stores do not retain a proof for are reported as untraceable with their
reason code (`PROOF-NOT-RETAINED-IN-CAPABILITY`, `PLAN-PROOF-NOT-RETAINED`,
`DESIGN-INTENT-NOT-RECONSTRUCTIBLE`); publication, release-preflight and briefed
test authorizations are named as not enumerated in every result.
