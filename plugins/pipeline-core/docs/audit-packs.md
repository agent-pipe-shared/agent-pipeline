# Local project audit packs

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
Signed quality-package integration trailers are discovered from at most 128
candidate commits and reverified through the canonical post-commit verifier.

The planner excludes private keys, operator profiles, environment values,
raw private Critic packet/report prose, and private local quality-package
authorization receipts. It never reads a private key or publishes anything.
Output is restricted to `scratch/audit-packs/<pack-id>` and must be Git-
ignored. Building re-runs the canonical evidence checks and refuses source or
candidate drift. Offline verification checks only the pack's internal digests;
it does not repeat signature authority checks or certify the evidence.

Use a request file with these commands:

```text
node plugins/pipeline-core/scripts/audit-pack.mjs plan --request <request.json>
node plugins/pipeline-core/scripts/audit-pack.mjs build --request <build-request.json>
node plugins/pipeline-core/scripts/audit-pack.mjs verify --request <verify-request.json>
```

Review the exact plan before building. A successful digest check means only
that copied bytes still match the pack manifest.
