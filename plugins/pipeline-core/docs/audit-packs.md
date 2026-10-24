# Project audit packs and historical public archives

`audit-pack.mjs` prepares a local, ignored review pack from one completed
Feature Package. Planning requires the package candidate to equal the current
Git `HEAD` and every package artifact to match its committed blob. The plan
lists each source path and digest, the exact output directory, and any missing
Verify, Critic, or approval evidence. A partial pack remains explicitly
partial; it does not authorize release or publication.

The request is a closed JSON object. `criticPacketIds` names consumed local
Critic packets for canonical private-receipt verification; only their sanitized
candidate, range, digest, and finding-count summary is exported. `approvalPairs`
names exact public intent/proof file paths under `evidence/` or the Feature
Package's own `evidence/` directory; both files are copied only after the
canonical PO proof verifier accepts the intent-bound signature and current
project trust anchor. `verifyEvidencePath` may name an exact public Verify
receipt and is checked with the canonical candidate selection validator.
`securityEvidencePath` may name an exact public Security v0 receipt. The
existing security gate evidence derivation checks its outcome and candidate;
an unreferenced Security receipt is explicitly missing. A scan artifact in a
Feature Package is listed separately and never counted as a Security pass.
Signed quality-package integration trailers are discovered from at most 128
candidate commits and reverified through the canonical post-commit verifier.

The planner excludes private keys, operator profiles, environment values,
raw private Critic packet/report prose, and private local quality-package
authorization receipts. It never reads a private key or publishes anything.
Local build output is restricted to ignored `scratch/audit-packs/<pack-id>`.
The `publish` operation accepts the same preview plan and writes a create-only
historical archive at the exact tracked home
`specs/<feature-id>/evidence/audit-packs/<pack-id>`. It reruns the canonical
source checks and refuses candidate or source drift before writing. Commit the
archive with the ordinary exact-path Git route. Public verification checks
that every archived file still equals its committed blob and that the named
historical candidate commit has the named tree; it works in a fresh clone.
The public manifest omits the local Critic packet ID while retaining its
candidate, review range, digests, finding count and assurance summary. The
local scratch pack keeps its existing shape for canonical receipt rechecks.
It does not qualify the archive commit for Verify, Security, Critic, approval,
or release. The archive records which checks ran on its historical candidate
and which evidence remains missing.

Use a request file with these commands:

```text
node plugins/pipeline-core/scripts/audit-pack.mjs plan --request <request.json>
node plugins/pipeline-core/scripts/audit-pack.mjs build --request <build-request.json>
node plugins/pipeline-core/scripts/audit-pack.mjs publish --request <publish-request.json>
node plugins/pipeline-core/scripts/audit-pack.mjs verify --request <verify-request.json>
```

The publish request has exactly `repositoryRoot`, `plan`, and `outputPath`;
the output path must match the tracked home above. Review the plan before
building or publishing. A successful archive check establishes committed
historical integrity only, not fresh gate authority or native provenance.

The governed command catalogue admits exact physical `audit-pack.mjs`
`plan`/`verify` requests as read-only operations. It routes exact `build` and
`publish` requests through the existing artifact-publication lane, which
still applies READY, output write policy and the source CLI's proof/candidate
checks. This source change is an inert proposal until integrated with normal
hooks; it is not evidence of a live installed guard.
