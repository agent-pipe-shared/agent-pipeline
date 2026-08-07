---
schema: pipeline.backlog-item.v1
id: pipeline.po-gate-authority-path-canonicalization
type: defect
owner: pipeline
status: closed
created: 2026-07-25
source: "Self-observation during Sprint Cyborg CYB-0 follow-up (approve-plan dispatch), 2026-07-24/25; direct reproduction via `node -e` against `resolvePoGateRepositoryTopology`."
closed_at: 2026-08-06
closure_repository: self
closure_commit: 3652d92ac02757d5bf0fde1e816e4f70710a0a1b
closure_evidence: backlog/evidence/2026-08-06-second-reconciliation-pass.md
---

# pipeline.po-gate-authority-path-canonicalization

## Description

`resolvePoGateRepositoryTopology` in `plugins/pipeline-core/lib/po-gate-authority.mjs`
(around lines 299-337) resolves the caller's `repoRoot` via
`realpathSync(resolve(repoRoot))`, then strictly compares (`!==`) that value
against `git rev-parse --show-toplevel`'s own output (also `realpathSync`'d).
On Windows, `realpathSync` preserves the casing supplied by the caller's
current working directory rather than normalizing to the filesystem's
canonical casing. When a shell's cwd is cased differently from disk-canonical
(e.g. a persistent shell that resets to a lowercase drive letter such as
`d:\dev\...` even after an explicit `cd`, versus git's disk-canonical
`D:\Dev\...`), the strict equality check fails with `Error: repository root
mismatch`, and the whole PO-gate-authority resolution throws.

## Triggering situation

Confirmed by direct reproduction on this host during the Sprint Cyborg design
phase: the same `resolvePoGateRepositoryTopology` call failed when invoked
from the Bash tool's persistent shell (lowercase-cased cwd) and succeeded when
invoked from the PowerShell tool (already correctly-cased cwd) against the
identical repository state. This blocked `harness/scripts/pipeline-state.mjs
approve-plan` end-to-end (surfaced as `PO-GATE-AUTHORITY-UNAVAILABLE`, exit 2)
for the `sprint-cyborg-epic` plan-approval recording. See `docs/state.md`
("CYB-0 done; recording planApproved surfaced two new native-Windows
candidates for the assurance slice — 2026-07-24") for the full diagnostic
trace.

## Affected artifact

`plugins/pipeline-core/lib/po-gate-authority.mjs` (`resolvePoGateRepositoryTopology`,
`gitObservation`); consumed by `harness/scripts/check-po-gate-authority.mjs`
and the `approve-plan` path of `harness/scripts/pipeline-state.mjs`. Related
class: the native-Windows DACL/directory-durability suite tracked in
`backlog/items/2026-07-22-windows-private-state-assurance.md` (#35) — same
receipt code area, but this is a distinct root cause (path-casing
canonicalization, not DACL/durability) and should not be silently folded into
#35's closure without its own fixture.

## Proposal

Canonicalize both sides of the comparison through a single case-insensitive-
but-case-preserving-aware path-equality primitive on win32 (e.g. compare via
`path.relative(a, b) === ""` after a shared lowercasing pass restricted to the
drive-letter/segment level, or resolve both paths from the *same* observation
source instead of mixing a caller-supplied cwd with a git-corrected value)
before the strict `!==` check. Add a Windows fixture that starts from a
deliberately mis-cased cwd and asserts the topology still resolves. No fix
applied yet — this item records the defect for the Windows/sandbox-assurance
slice; scope and sequencing decision is in `docs/state.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, delivered, closed.
- **Rationale:** fixed by `3652d92` ("fix(pipeline-core): correct
  native-Windows path-case mismatch in resolvePoGateRepositoryTopology"),
  2026-07-25 — the day after this item was filed, but never linked back.
  `po-gate-authority.mjs:336-351` now re-derives both sides through
  `realpathSync.native` immediately before the equality check, matching this
  item's Proposal exactly, including the deliberately-mis-cased-cwd fixture
  it asked for. Independently re-verified 2026-08-06:
  `node --test plugins/pipeline-core/lib/po-gate-authority.test.mjs` → 36/36
  pass. Full evidence: `backlog/evidence/2026-08-06-second-reconciliation-pass.md`.
- **Assignment (if accepted):** delivered, `3652d92`, Sprint Nova session,
  2026-07-25.
- **Date:** 2026-08-06
