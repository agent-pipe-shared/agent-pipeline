# Human-terminal action templates — Slices 2 and 3 implementation evidence

Date: 2026-09-12
Backlog item: `pipeline.template-scripts-for-human-terminal-actions`
Design: `backlog/evidence/NVA-B-HUMAN-TERMINAL-TEMPLATES-DESIGN-1.md`

## Candidate binding

Implementation candidate: `824e787c6fa9cdce1fa7ff6b9335bd21ec28160a`
Implementation tree: `6efceccbe05748f10bf502163ff5b5bb2f6a59f3`

The implementation commit contains the six implementation blobs below at the
recorded SHA-256 values:

| Path | SHA-256 |
|---|---|
| `harness/scripts/check-auth-gate-inventory-drift.test.mjs` | `b243f7ea0bd97d92c8811076cd207710f98e6088f247cb335ef5a80acfe721f9` |
| `plugins/pipeline-core/lib/human-terminal-action-catalog.mjs` | `16e1cae8772e71a38bb29fce14f535a75185586fbf50152e3d4ee1b53be5ffa1` |
| `plugins/pipeline-core/lib/human-terminal-action-instance.mjs` | `e17f1b5c9502676dc80f91a9479076894731e8b84ba2e01abe6372744a30fb12` |
| `plugins/pipeline-core/schemas/human-terminal-action-instance.schema.json` | `bf51b230a9cad1cef7ca78795b7f6aa45cde1a9df6f48a5990ff736f4e827ac2` |
| `plugins/pipeline-core/schemas/human-terminal-action-receipt.schema.json` | `dee9837e6534da31c8f52b7e5ecb5893a8e8c271f17585f50d3f8cfcc03ce462` |
| `plugins/pipeline-core/schemas/human-terminal-action-receipt-v2.schema.json` | `e2274a70bc11d7bba890098d10ed057a590ba2a4708c9a9f1ad959654265869b` |
| `plugins/pipeline-core/scripts/human-terminal-action.mjs` | `f28fc920357343ca60b32619bfbc257ff8a25c2f0ba840e6f5419893cc5654b7` |

The implementation commit contains the listed blobs. Slice 3 additionally
binds the existing PO-key and installed-plugin-attestation producers and their
focused tests.

## Implemented behavior

The generic POSIX runtime now exposes `prepare`, `inspect`, and `run` entry
points while delegating action construction to the closed Slice-1 builder
registry. Preparation validates the catalog's ordered typed slots and creates
no instance for missing or unknown input. A prepared request binds template
revision, catalog bytes, builder source, exact builder output, boundary,
expected readback, repository commit/tree, values, runner, platform, creation
time, and its own digest.

Prepared state is confined to
`scratch/human-terminal-actions/<instance-id>/`. Both directories are private
POSIX directories; `request.json` is `0600`, the minimal launcher is `0700`,
and both are read back after exclusive no-follow creation. Inspection rejects
wrong owner or mode, symlinks, request hard links, byte or self-digest changes,
unexpected location, launcher changes, catalog changes, builder-source changes,
builder-output changes, template/readback changes, and invalid slot values.
The displayed launcher uses the existing shared copy-safe renderer and retains
its 72-column bound.

`run` re-inspects the frozen instance before child creation, compares the
current repository candidate, and uses shell-free argv with inherited stdin,
stdout, and stderr. The existing driver's disclosure and result stay visible
in the attended terminal. The runner never parses or stores that mixed output;
it determines the outcome only through child exit and an independent typed
readback adapter.

After a successful child, absent, failed, or schema/code-mismatched readback is
recorded as `outcome-unknown` / `HTA-RUN-MANUAL-RECONCILIATION`, with
`retrySafe: false` and `mutationMayHaveOccurred: true`. It is never presented
as a failed, safely repeatable action. The private self-digested receipt
contains action/revision, input and candidate digests, exit and typed readback
state. It contains no raw output, private path, username, passphrase, or
session identifier.

The reconciliation-capable receipt is v2; the published v1 schema remains
unchanged for compatibility. A readback adapter must resolve before child
spawn. If a resolved adapter throws after successful mutation, v2 records
manual reconciliation and never claims a safe retry.

## Honest reachability boundary

The original critical-push Slice-1 builder still has `boundary: null`
because its source producer does not expose a structured boundary tuple.
Consequently the shipped catalog refuses preparation with
`HTA-PREPARE-BOUNDARY-UNATTESTED`. Tests use a synthetic future entry with the
exact supported user-copy tuple to verify the runner machinery without
inventing production authority.

The public CLI supplies neither trusted attended caller provenance nor an
independent readback adapter. Its `run` command therefore refuses before
spawning. Positive execution is covered through injected test seams only; it
is not a shipped reachability claim. Producer adoption and its trusted host
adapter remain Slice 3. This slice makes no native Windows, native Codex
Sandbox, or Codex App Server claim under WSL. Windows remains typed
`unsupported` pending Slice 4 native ACL/reparse work.

## Checks

- `node harness/scripts/check-auth-gate-inventory-drift.test.mjs` — exit 0,
  34/34 tests passed, including inherited terminal streams, producer argv
  equality, and absent/failed/thrown/mismatched readback reconciliation.
- `node harness/scripts/check-auth-gate-inventory-drift.mjs` — exit 0; 11
  discovered surfaces and all 20 canonical inventory rows/dispositions clean.
- `node harness/scripts/check-verify-suite-registration.mjs` — exit 0; 532
  registered, 0 excluded, 0 unregistered.
- `node harness/scripts/check-doc-contracts.mjs` — exit 0; 1,586 Markdown
  files, 1,370 links and 20 anchor checks valid.
- Draft 2020-12 schema self-check through Python `jsonschema` — exit 0 for both
  new schemas.
- `node --check` for the new runtime and CLI — exit 0.
- `git diff --check` for all Slice-2 implementation paths — exit 0.

The complete PO helper suite passed 110/110 and the complete pipeline-start
preflight suite passed 55/55 when their local Git fixtures were run outside
the WSL process sandbox. The installed-attestation host suite passed 8/8. No
full Verify was run for this focused candidate.

## Residual slices

- **Further producer adoption — owner: pipeline; re-triage: 2026-09-30.** The
  first two producers are registered. Additional producers require their own
  exact structured boundary/readback adapters and byte-equality evidence.
- **Slice 4 native Windows — owner: pipeline; re-triage: 2026-10-31.** Reassess
  the deferred native-Windows package. It must implement and test native
  Windows owner/DACL/reparse protection before enabling Windows launchers.
  This is a re-triage date, not a readiness promise.
