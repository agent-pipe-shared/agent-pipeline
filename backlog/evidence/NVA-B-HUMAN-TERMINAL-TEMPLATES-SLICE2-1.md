# Human-terminal action templates — Slice 2 implementation evidence

Date: 2026-09-12
Backlog item: `pipeline.template-scripts-for-human-terminal-actions`
Design: `backlog/evidence/NVA-B-HUMAN-TERMINAL-TEMPLATES-DESIGN-1.md`

## Candidate binding

Candidate is pending commit. The implementation was checked with repository
HEAD `4e3447067634b1c01a14330b7eb47c9e1a7d5008` and HEAD tree
`65fc3ad5e7abb404b144a012ea016dd685eef9ab`. Those objects do not contain the
working files below. Their exact working-file SHA-256 values at the checked
point were:

| Path | SHA-256 |
|---|---|
| `harness/scripts/check-auth-gate-inventory-drift.test.mjs` | `abaae6d559f13f14d0ea06149ba658d2a2138be90c53308f2dfeee7c15892dab` |
| `plugins/pipeline-core/lib/human-terminal-action-catalog.mjs` | `f09d2738d8ef53ffc25526ec398b846accf985e55ec4b27eb1d07b9deb7ea7da` |
| `plugins/pipeline-core/lib/human-terminal-action-instance.mjs` | `8d6d545e6aec72127088bebe632b0be5ff455bc0c5dee818d2f3cf46f40ddc7d` |
| `plugins/pipeline-core/schemas/human-terminal-action-instance.schema.json` | `bf51b230a9cad1cef7ca78795b7f6aa45cde1a9df6f48a5990ff736f4e827ac2` |
| `plugins/pipeline-core/schemas/human-terminal-action-receipt.schema.json` | `dee9837e6534da31c8f52b7e5ecb5893a8e8c271f17585f50d3f8cfcc03ce462` |
| `plugins/pipeline-core/scripts/human-terminal-action.mjs` | `f28fc920357343ca60b32619bfbc257ff8a25c2f0ba840e6f5419893cc5654b7` |

This evidence file itself is intentionally excluded from that pre-write blob
table. The final commit must replace this section with the committed candidate
and tree before claiming candidate-bound acceptance.

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
current repository candidate, uses shell-free argv, requires typed child
success plus independent verified readback, and writes a private self-digested
receipt. The receipt contains action/revision, input and candidate digests,
exit/result/readback fields and digests; it contains no raw output, private
path, username, passphrase, or session identifier.

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
  30/30 tests passed, including direct cross-entry binding and wrong-result-
  schema refusals.
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

- Slice 3 must migrate selected producers, supply their exact structured
  boundary/readback adapters, and prove byte equality with their old output.
- Slice 4 must implement and test native Windows owner/DACL/reparse protection
  before enabling Windows launchers.
