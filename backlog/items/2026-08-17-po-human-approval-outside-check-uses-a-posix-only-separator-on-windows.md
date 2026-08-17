---
schema: pipeline.backlog-item.v1
id: pipeline.po-human-approval-outside-check-uses-a-posix-only-separator-on-windows
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Reported by the PO on 2026-08-17, relaying a real Windows/Codex session transcript from a downstream consumer project's `po-human-approval.mjs setup` run. Root cause independently diagnosed in this repository from the transcript's symptoms."
---

# `po-human-approval.mjs`'s `outside()` check never recognizes a genuinely external directory on Windows

## Description

`scripts/po-human-approval.mjs`'s `setup` command requires the signing-key
`--directory` to be outside the repository root (`outside(repoRoot, path)`,
enforced at three call sites: lines 242, 257, 263). The check itself
(lines 213-216):

    function outside(repoRoot, path) {
      const root = resolve(repoRoot); const target = resolve(path); const rel = relative(root, target);
      return rel === "" ? false : rel === ".." || rel.startsWith("../") || isAbsolute(rel);
    }

is correct on POSIX but broken on Windows for the common case (repo and key
directory on the SAME drive letter): Node's `path.relative()` on Windows
returns a **backslash**-separated string (`..\agent-pipeline-key`), so
`rel.startsWith("../")` (a forward-slash literal) never matches, `rel` is
never exactly `".."`, and `isAbsolute(rel)` is false for a same-drive
relative path. `outside()` therefore returns `false` — "not outside" — for a
directory that plainly IS outside the repository, and setup fails with
"approval directory (from ...) must be outside the repository" for a
correct, external `--directory` value.

## Triggering situation

A real Windows/Codex `po-human-approval.mjs setup` run (2026-08-17), repo
root `D:\Dev\HA`, first attempted `--directory D:\Dev\agent-pipeline-key`
(same drive, genuinely outside `D:\Dev\HA`) — refused as "inside" the
repository. The session worked around it by moving the key directory to a
**different drive letter** (`C:\Users\...\OneDrive\Documents\...`), which
"fixed" the symptom only by accident: `path.relative()` across two different
Windows drive letters returns the full absolute target path rather than a
`..`-relative one (there is no common root to express relatively), so the
existing `isAbsolute(rel)` branch happens to catch it correctly. The
same-drive case — very likely the common case in practice — stays broken.

**Consequence:** the workaround the session actually shipped puts the
private Ed25519 signing key material in a folder synced by OneDrive. The PO
has since clarified this is an intentional, accepted storage choice for this
key (enables reuse across repositories) — not a forced compromise — so this
is not filed as a security finding. The underlying bug is still worth
fixing on its own terms: it silently rejects a genuinely valid, external,
same-drive `--directory` value with a misleading "must be outside the
repository" message, for what is very likely the common case in practice.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs`, function `outside()`
(lines 213-216) and its three call sites (lines 242, 257, 263).

## Proposal

Make the containment check separator-agnostic — e.g. compare `rel` against
both `".."`/`"../"` and `".."`/`"..\\"` forms, or (more robust) split `rel`
on `/[\\/]/` and check whether the first segment is exactly `".."`, rather
than a literal forward-slash prefix match. `isAbsolute(rel)` already covers
the cross-drive case correctly and needs no change. Add a Windows-shaped
regression fixture: same-drive-letter repo root and key directory, with a
`path.relative()` stub or a constructed backslash-separated `rel` value, so
this class of bug is caught without requiring an actual Windows CI runner.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — genuine defect with a clear, small, well-localized fix that silently misclassifies a valid external directory as "inside" for the common same-drive-letter case on Windows. Not fixed in this same session pass; filed for a dedicated goldfish-deep dispatch with mandatory Critic review (guardrail/security-adjacent: gates whether a private signing key setup succeeds).
- **Rationale:** root cause independently confirmed by direct code reading (not just inferred from the transcript); fix is small and low-risk, but this file governs signing-key setup, so it goes through the standard dispatch + Critic discipline rather than a same-session edit.
- **Assignment (if accepted):** next available dispatch slot in this AFK block, folded into the 0.5.5 candidate.
- **Date:** 2026-08-17
