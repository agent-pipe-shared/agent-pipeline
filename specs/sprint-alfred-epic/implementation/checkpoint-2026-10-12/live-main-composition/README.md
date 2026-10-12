# Remaining live Main Source — administrative preparation

## Completed checkpoint readback

The final explicit scope contains 317 files. The actual external-base strict
check matched all 317 Git-parsed patch targets and passed. Staged and committed
blob readbacks match the frozen bytes, modes and request digests. The human
signed intent `ee0b27b272019a22e935c85ccc4efebb713f2577fe6245ead641d3e6f36d1aae`;
the installed authorizer and native Commit hook accepted Source commit
`d02409a8a7e63067f3cc2964b98e7d39e6ab57b6`, parent
`8d87a95bcb04a9edfad3998fd34ed7d827039156`.

Use `manifest.json`, `strict-check-receipt.json`, `quality-request.json`,
`public-quality-proof.json`, `staged-packaging-readback.json` and
`committed-packaging-readback.json` as the actual checkpoint records.
`signing-review-material.json` preserves the bytes shown during signing.
The helper steps below describe their production and are not a request to
repeat them on the next host. No functional test, Critic, Full Verify, release
or acceptance PASS is claimed by this packaging check.

## Historical preparation procedure

The amended `proposed-allowlist-v2.json` contains317 remaining public Main paths at HEAD `7530c94fc36549c1ef3be91dd4d310f9b8ae604f`:195 tracked dirty paths and122 untracked paths. The317 include `.github` (1), root README/PIPELINE_FLOW files (3), architecture (2), docs (11), governance (1), guardrails (1), harness (18), plugins (271), policies (1), roles (3), schemas (1) and templates (4). All1176 already-staged ordinary checkpoint paths are excluded, as are the helper's own outputs. The original293-path three-root proposal remains immutable in `proposed-allowlist.json` and is hash-bound by V2. These are provisional path counts, not frozen postimages, test results or approval. Root's ordinary commits may reduce this list or change HEAD. Final capture is deferred until Root signals the final base.

`prepare.mjs` is a transparent, write-once administrative helper. Inventory uses every actual dirty/untracked Git path and records exact per-path exclusions; it no longer relies on three public Source prefixes. It operates only in this directory, reads the explicit V2 allowlist, checks physical containment/single-link/modes, snapshots current postimages and committed base blobs, and constructs a binary Git diff with exact target-set agreement. No Main index, working files or Git objects are written. New paths outside the allowlist require a separate explicit amendment. Scratch, `.git`, private `.claude`/runtime sessions/transcripts, lifecycle payloads, private state, authority and key stores are excluded. No currently remaining path needed a private/key exclusion; the other non-staged exclusions are the helper's three own files. Snapshot creation is not Source activation.

Once Root supplies the exact final HEAD, the separate steps are:

1. `node .../live-main-composition/prepare.mjs freeze <exact-final-HEAD>` — capture Source bytes and patch. A credential-body finding stops request creation and emits only path/category diagnostics. Public fixtures may contain deliberate disposable samples; any such stop needs exact static classification, never automatic stripping or a key-store scan.
2. `node .../live-main-composition/prepare.mjs strict-check <same-HEAD>` — create a Root-reviewed owned `/var/tmp/alfred-main-checkpoint-*` base copy outside every Git repository, with no `git init`. Require no ancestor `.git` and actual `git rev-parse --is-inside-work-tree` failure128, verify every base byte/mode or required absence, and require Git's parsed patch-target set to match the complete manifest. Only then run actual `git apply --check --whitespace=error -` from that outside-repository cwd. Capture actual exit/status/output, preserve refusals and verify unchanged Source postimages. An inside-Main subdirectory check is prohibited because it can ignore all out-of-prefix patch paths and return misleading zero. Published fixture references are logical relative identifiers; temporary host paths are not published. This performs no patch application or index write and makes no resulting-tree readback claim.
3. `node .../live-main-composition/prepare.mjs request <same-HEAD>` — require a real successful strict-check receipt, exact current Source/postimage CAS and the real signed-quality module's pure intent/disclosure validator. Emit the five-field `pipeline.signed-quality-package.v1` request. It remains unsigned and unapproved.

The inspected existing producer `scratch/alfred-egm-operating-optimization-20261011/prepare-quality-request.mjs` also requires an actual successful composition check before calling `qualityPackageIntentSha256()` and `describeSignedQualityPackageIntent()`. The helper preserves that boundary. It does not reuse the signed-quality API's private-index materialization because that mechanism writes repository objects. The real package validator requires exact patch-target/digest set agreement and discloses all paths; no fictional “strict check passed” field can substitute for the recorded Git result.

Current command-shape/test-path refusals remain authoritative. No unsupported alternate route or HGO is built into this helper. A changed HEAD or Source byte stops the later step. Signing, protected Source admission, staging, commit, FullVerify, independent review and pushing remain Root/operator actions. No final composition, request, functional tests, review or signature has run in this preparation.
