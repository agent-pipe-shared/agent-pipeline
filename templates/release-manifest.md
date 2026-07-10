<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Release Manifest (`docs/releases/<version>.md`) — Agent-Pipeline
v0.1.0-draft
Source of truth: ADR-0032 (docs/adr/0032-projekt-doku-struktur.md).
Motivation: the PO pain point "what got built in which version?".
Language note (ADR-0011 primary-reader rule): this template's INSTRUCTIONS
are English (agent-facing); the FILLED manifest is written in the project's
human-facing language (default English) — release manifests are explicitly
human-facing (the PO is the primary reader).

USAGE
1. GREENFIELD ONLY (ADR-0032): adopt this structure from the point a project
   starts using it — never backfill a manifest for a release that shipped
   BEFORE adoption. Existing projects adopt only on the PO's initiative,
   project-individually — no automatic rollout.
2. Copy this file to `docs/releases/<version>.md` (version = the project's
   tag, e.g. `v0.3.0`) at release time. One file per release; a release
   manifest is never overwritten after the release it describes has shipped
   — a later correction gets a dated addendum inside the same file instead.
3. Fill every {{PLACEHOLDER}}, delete this comment block.
4. Link, never duplicate: reference specs/PRDs, ADRs, and evidence snapshots
   by repo-relative path — do not inline their content here (dedup
   discipline, same principle as `docs/state.md`/ADR bodies).
5. "Known Gaps" is a MANDATORY section even when empty — write "none"
   rather than omitting it (QG-05 honesty: an empty section reads as
   "forgotten", an explicit "none" reads as "checked").
6. Evidence snapshot paths point at COMMITTED snapshots (pattern:
   `specs/<date>-<topic>/evidence/...`) — never at the git-ignored
   `evidence/verify-latest.json`/`evidence/security-latest.json` runtime
   files, which do not survive past the next run.
═══════════════════════════════════════════════════════════════════════════
-->

# Release Manifest {{VERSION}} ({{YYYY-MM-DD}})

> What got built in this version? {{PROJECT_NAME}} · Release {{VERSION}}

## Features

- {{Feature/change 1 — 1 sentence, what for whom}}

## PRDs / Specs

- {{Link to specs/<date>-<topic>/ or the specific PRD/spec file this release was built and tested against}}

## Decisions / ADR Deltas

- {{New or changed ADRs since the last release, with link — "none" if there were none}}

## Architecture Status

- Architecture document version at release time: {{Reference to docs/ARCHITECTURE.md — version header value or commit SHA at release time}}

## Test/Verify Evidence

- Snapshot path(s): {{e.g. specs/<date>-<topic>/evidence/verify-<version>.json — committed snapshot, not the runtime file}}

## Security Evidence

- Snapshot path(s): {{e.g. specs/<date>-<topic>/evidence/security-<version>.json — committed snapshot, not the runtime file}}

## SBOM Status / SBOM Delta

- {{Reference to the third-party-licenses.json state + osv-scanner evidence for this release (baseline SBOM, ADR-0032); if the project additionally maintains a full CycloneDX SBOM (ADR-0032 option): path to this release's SBOM file}}

## Known Gaps

- {{Known gaps as of this release, or "none" — mandatory field, do not omit}}
