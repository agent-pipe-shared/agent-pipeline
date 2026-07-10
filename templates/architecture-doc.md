<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: living Architecture Doc (`docs/ARCHITECTURE.md`) — Agent-Pipeline
v0.1.0-draft · retro-speed session · 2026-07-07
Source of truth: ADR-0032 (docs/adr/0032-project-doc-structure.md).
Language note (ADR-0011 primary-reader rule): this template's INSTRUCTIONS
are English (agent-facing); the FILLED doc is in the project's human-facing
language, default English — the PO is the primary reader.

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

# {{PROJECT_NAME}} — Architecture

> Version header: {{ARCHITECTURE_DOC_VERSION, e.g. "v1, as of 2026-07-07"}} · Current state — no change log in this document, changes per release see `docs/releases/<version>.md`.

## Overview

{{2–4 sentences: what the system is, core purpose, primary users.}}

## Components

- {{Component 1}} — {{1-sentence purpose}}
- {{Component 2}} — {{1-sentence purpose}}

## Data Flow / Interfaces

{{Short description of the data flow between components, or a reference to a diagram/diagram file.}}

## Tech Stack

- {{Language(s)/Framework(s)/Package manager/Test runner}}

## Decision References

- {{Reference to project-specific ADRs that shape the current architecture (e.g. "docs/adr/000X-....md")}}

## Changes per Release

> This section links ONLY — details (features, PRDs/specs, evidence, SBOM delta) live in the respective release manifest, never duplicated here.

- {{VERSION}}: see `docs/releases/{{VERSION}}.md`
