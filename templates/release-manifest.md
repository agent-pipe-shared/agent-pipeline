<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Release-Manifest (`docs/releases/<version>.md`) — Agent-Pipeline
v0.1.0-draft
Source of truth: ADR-0032 (docs/adr/0032-projekt-doku-struktur.md).
Motivation: the PO pain point "was wurde in welcher Version gebaut?".
Language note (ADR-0011 primary-reader rule): this template's INSTRUCTIONS
are English (agent-facing); the FILLED manifest is GERMAN — release
manifests are explicitly human-facing (the PO is the primary reader).

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
5. "Bekannte Lücken" is a MANDATORY section even when empty — write "keine"
   rather than omitting it (QG-05 honesty: an empty section reads as
   "forgotten", an explicit "keine" reads as "checked").
6. Evidence snapshot paths point at COMMITTED snapshots (pattern:
   `specs/<datum>-<thema>/evidence/...`) — never at the git-ignored
   `evidence/verify-latest.json`/`evidence/security-latest.json` runtime
   files, which do not survive past the next run.
═══════════════════════════════════════════════════════════════════════════
-->

# Release-Manifest {{VERSION}} ({{YYYY-MM-DD}})

> Was wurde in dieser Version gebaut? {{PROJEKT_NAME}} · Release {{VERSION}}

## Features

- {{Feature/Änderung 1 — 1 Satz, was für wen}}

## PRDs / Specs

- {{Link auf specs/<datum>-<thema>/ bzw. die konkrete PRD-/Spec-Datei, gegen die dieses Release gebaut und getestet wurde}}

## Entscheidungen / ADR-Deltas

- {{Neue oder geänderte ADRs seit dem letzten Release, mit Link — "keine" wenn es keine gab}}

## Architektur-Stand

- Architektur-Dokument-Version zum Release-Zeitpunkt: {{Verweis auf docs/ARCHITECTURE.md — Versions-Header-Wert oder Commit-SHA zum Release-Zeitpunkt}}

## Test-/Verify-Evidenz

- Snapshot-Pfad(e): {{z. B. specs/<datum>-<thema>/evidence/verify-<version>.json — committeter Snapshot, nicht die Laufzeit-Datei}}

## Security-Evidenz

- Snapshot-Pfad(e): {{z. B. specs/<datum>-<thema>/evidence/security-<version>.json — committeter Snapshot, nicht die Laufzeit-Datei}}

## SBOM-Stand / SBOM-Delta

- {{Verweis auf den third-party-licenses.json-Stand + osv-scanner-Evidenz dieses Release (Baseline-SBOM, ADR-0032); falls das Projekt zusätzlich eine volle CycloneDX-SBOM führt (ADR-0032-Option): Pfad zur SBOM-Datei dieses Release}}

## Bekannte Lücken

- {{Bekannte Lücken zu diesem Release-Zeitpunkt, oder "keine" — Pflichtangabe, nicht weglassen}}
