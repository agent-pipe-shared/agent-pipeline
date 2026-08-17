---
schema: pipeline.backlog-item.v1
id: pipeline.external-public-json-cross-drive-windows-paths-are-not-recognized-as-outside-the-project-root
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-17
closure_repository: self
closure_commit: be7a992edf548af3410adab07520b8baad95a5db
closure_evidence: backlog/items/2026-08-17-external-public-json-cross-drive-windows-paths-are-not-recognized-as-outside-the-project-root.md
created: 2026-08-17
source: "Live consumer-project happy-path test, D:\\Dev\\HA, 2026-08-17, runner Claude, version 0.5.5+claude.20260817142605.6465407 -- relayed and independently re-verified against this checkout's own current source before filing."
---

# `pipeline-state.mjs approve-push` refuses every proof path on Windows when the key directory is on a different drive than the project

## Description

`scripts/pipeline-state.mjs`'s `externalPublicJson()` (~line 2711) checks
that a supplied proof path lies outside the project root via:

```js
if (path === root || !relative(root, path).startsWith("..")) return { ok: false, code: "CRITICAL-PROOF-EXTERNAL-PATH" };
```

Node's `path.relative()` between two different Windows drive letters returns
the full absolute target path unchanged, never a `".."`-prefixed relative
path. `relative(root, path).startsWith("..")` is therefore `false` for a
path that is unambiguously outside the project root, and the check wrongly
concludes it is "inside" — refusing the entire signature-based `approve-push`
flow with `CRITICAL-PROOF-EXTERNAL-PATH`, even when `--proof-request`,
`--proof-authority` and `--proof` all name real, valid, correctly PO-signed
JSON files.

This is not a niche layout. Project root on a data drive (`D:\Dev\HA`) and a
PO key directory under `C:\Users\<name>\OneDrive\...` is close to the DEFAULT
Windows arrangement — OneDrive lives on `C:` almost universally, project
repositories are frequently on a separate data drive.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs`, `externalPublicJson()`.

## Not a duplicate of the already-fixed same-drive backslash bug

`NVA-WINPATH-1`/`NVA-WINPATH-2` already fixed a related but DIFFERENT defect
in `po-human-approval.mjs`'s `outside()` check — a POSIX-only separator
assumption on the SAME drive. This item is a different function
(`externalPublicJson()` in `pipeline-state.mjs`) and a different failure
shape (cross-drive, not same-drive-wrong-separator); confirmed via
independent code re-verification, not assumed from the similarity of the
symptom.

## Proposal

Not designed here. `externalPublicJson()`'s containment check needs a
Windows-drive-letter-aware test — e.g. `path.resolve()` both sides plus an
explicit drive-letter comparison before falling back to `relative().startsWith("..")`,
or a small shared `isPathOutside(root, path)` utility with dedicated
cross-drive Windows test coverage, usable everywhere this repository does a
similar containment check (this class has recurred at least twice now).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope, high priority — this blocks the
  entire signature-based push-approval path (this repository's own
  configured `gates.push_approval: signature`) on any Windows machine with
  project and key directory on different drives, which the evidence above
  argues is the common case, not an edge case.
- **Rationale:** independently re-verified against this checkout's own
  current source (not trusted from the relay): `pipeline-state.mjs:2711`
  carries exactly the cited pattern, no drive-letter guard present.
- **Assignment (if accepted):** security/guardrail-tier (MP-07), goldfish-deep
  + Critic review, same family as the other push-approval-ceremony items
  already queued this session
  (`2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`,
  `2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`).
- **Date:** 2026-08-17

## Closure (2026-08-17)

Fixed via goldfish-deep dispatch NVA-WINPATH-3 (truncated mid-verify;
Elephant reviewed the diff directly, independently re-ran
`node --test plugins/pipeline-core/scripts/pipeline-state.test.mjs` — 1/1
pass — and finalized as an Elephant closeout). `externalPathIsOutsideRoot()`
extracted, mirroring the platform-injectable win32Path/posixPath pattern
already used by `po-human-approval.mjs`'s `outside()` (NVA-WINPATH-1/2);
`externalPublicJson()` now uses it instead of the default host-platform
`relative()`. Commit `be7a992edf548af3410adab07520b8baad95a5db`.
