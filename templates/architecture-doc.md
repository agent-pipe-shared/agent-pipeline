<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: living Architecture Doc (`docs/ARCHITECTURE.md`) — Agent-Pipeline
v0.1.0-draft · retro-speed-Session · 2026-07-07
Source of truth: ADR-0032 (docs/adr/0032-projekt-doku-struktur.md).
Language note (ADR-0011 primary-reader rule): this template's INSTRUCTIONS
are English (agent-facing); the FILLED doc is GERMAN — human-facing,
the PO is the primary reader.

USAGE
1. GREENFIELD ONLY (ADR-0032): create at project birth (see
   `templates/prompts/kickoff-new-project.md`) or at the point an existing
   project adopts the doc-structure standard on the PO's initiative.
2. CURRENT-STATE-ONLY document — no change log in prose here. Every change
   since the last release is recorded in THAT release's manifest
   (`docs/releases/<version>.md`, template: `templates/release-manifest.md`),
   never duplicated in this file. This mirrors the handover principle
   (`templates/handover.md`): a living pointer, not an archive.
3. Update whenever the architecture actually changes (not every session);
   bump the version header each time so release manifests can reference a
   concrete version of this document.
4. Keep it lean — link to ADRs/specs for the "why", this file is the "what,
   right now".
═══════════════════════════════════════════════════════════════════════════
-->

# {{PROJEKT_NAME}} — Architektur

> Versions-Header: {{ARCHITEKTUR_DOC_VERSION, z. B. "v1, Stand 2026-07-07"}} · Aktueller Ist-Stand — kein Änderungsjournal in diesem Dokument, Änderungen je Release siehe `docs/releases/<version>.md`.

## Überblick

{{2–4 Sätze: was das System ist, Kernzweck, primäre Nutzer:innen.}}

## Komponenten

- {{Komponente 1}} — {{1 Satz Zweck}}
- {{Komponente 2}} — {{1 Satz Zweck}}

## Datenfluss / Schnittstellen

{{Kurzbeschreibung des Datenflusses zwischen den Komponenten, oder Verweis auf ein Diagramm/eine Diagramm-Datei.}}

## Tech-Stack

- {{Sprache(n)/Framework(s)/Paketmanager/Testrunner}}

## Entscheidungs-Verweise

- {{Verweis auf projekteigene ADRs, die die aktuelle Architektur prägen (z. B. "docs/adr/000X-....md")}}

## Änderungen je Release

> Diese Sektion verlinkt NUR — Details (Features, PRDs/Specs, Evidenz, SBOM-Delta) stehen im jeweiligen Release-Manifest, nie hier dupliziert.

- {{VERSION}}: siehe `docs/releases/{{VERSION}}.md`
