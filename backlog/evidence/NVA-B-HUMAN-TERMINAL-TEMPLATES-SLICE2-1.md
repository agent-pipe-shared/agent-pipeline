# Human-terminal action templates — Slice 2 implementation evidence

Date: 2026-09-12
Backlog item: `pipeline.template-scripts-for-human-terminal-actions`
Design: `backlog/evidence/NVA-B-HUMAN-TERMINAL-TEMPLATES-DESIGN-1.md`

## Candidate binding

Correction candidate: `e4d7539d5684f59f3f817670e8a52f70e06e8b3a`
Correction tree: `9808669a94b37b773c4c8d75e676723f62dccecd`

The implementation commit contains the six implementation blobs below at the
recorded SHA-256 values:

| Path | SHA-256 |
|---|---|
| `harness/scripts/check-auth-gate-inventory-drift.test.mjs` | `ce67bd1f85b4e88f7dce841f41111d751a119f21a576e9f00f23a018615910fc` |
| `plugins/pipeline-core/lib/human-terminal-action-catalog.mjs` | `f09d2738d8ef53ffc25526ec398b846accf985e55ec4b27eb1d07b9deb7ea7da` |
| `plugins/pipeline-core/lib/human-terminal-action-instance.mjs` | `7acf9ebc083dd86755573265aca035bc54526c6b1ef69b915ce5ab8f4963f04e` |
| `plugins/pipeline-core/schemas/human-terminal-action-instance.schema.json` | `bf51b230a9cad1cef7ca78795b7f6aa45cde1a9df6f48a5990ff736f4e827ac2` |
| `plugins/pipeline-core/schemas/human-terminal-action-receipt.schema.json` | `3af64f6a32825d3b1c2737fc4efa8234e30a5371fe6d594c293004e53be2673e` |
| `plugins/pipeline-core/scripts/human-terminal-action.mjs` | `f28fc920357343ca60b32619bfbc257ff8a25c2f0ba840e6f5419893cc5654b7` |

The correction commit contains the six implementation blobs listed above.

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

## Honest reachability boundary

The only currently registered Slice-1 builder still has `boundary: null`
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
  31/31 tests passed, including inherited terminal streams, direct cross-entry
  binding, and absent/failed/mismatched readback reconciliation.
- `node harness/scripts/check-auth-gate-inventory-drift.mjs` — exit 0; 11
  discovered surfaces and all 18 canonical inventory rows/dispositions clean.
- `node harness/scripts/check-verify-suite-registration.mjs` — exit 0; 532
  registered, 0 excluded, 0 unregistered.
- `node harness/scripts/check-doc-contracts.mjs` — exit 0; 1,585 Markdown
  files, 1,370 links and 20 anchor checks valid.
- Draft 2020-12 schema self-check through Python `jsonschema` — exit 0 for both
  new schemas.
- `node --check` for the new runtime and CLI — exit 0.
- `git diff --check` for all Slice-2 implementation paths — exit 0.

No full verify was run for this focused, uncommitted slice.

## Residual slices

- **Slice 3 — owner: pipeline; re-triage: 2026-09-30.** Reassess scope and
  sequencing, then migrate selected producers, supply their exact structured
  boundary/readback adapters, and prove byte equality with their old output.
  This is a re-triage date, not a readiness promise.
- **Slice 4 native Windows — owner: pipeline; re-triage: 2026-10-31.** Reassess
  the deferred native-Windows package. It must implement and test native
  Windows owner/DACL/reparse protection before enabling Windows launchers.
  This is a re-triage date, not a readiness promise.
