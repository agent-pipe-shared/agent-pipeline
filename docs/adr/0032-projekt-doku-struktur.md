# ADR-0032: Project Documentation Structure — Release Traceability, SBOM Convention, Living Architecture Document (GREENFIELD)

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · retro-speed session (follow-up to AP1-TUNING) · as of 2026-07-07

**Status:** accepted (2026-07-07, PO directive from the AP1-TUNING session + plan approval "retro-speed") · **Basis:** PO directive (verbatim), `.claude/plans/2026-07-07-retro-speed.md` package G-E

## Context

The PO raised three live pain points about the existing projects (`<PROJECT_A>`/`<PROJECT_B>`/`<PROJECT_C>`) in the AP1-TUNING session: no SBOM overview, no architecture overview, no reliable answer to "what was built in which version?". The core ask: a standardized version control that pulls in PRDs/spec documents — releases reference the specifications they were built and tested against. The existing setup already has building blocks, but they aren't linked release-by-release: the ADR structure (`docs/adr/` + index, portable via `templates/adr.md`), session documentation (`docs/state.md` + dispatch ledger, chronological rather than release-scoped), the `specs/<date>-<topic>/` convention (spec/prd/evidence, without tag linkage), SemVer tags (this repo since `v0.2.0`, register entry E2), and proto-SBOM building blocks from the AP1 security layer (`third-party-licenses.json` + osv-scanner evidence, `guardrails/security.md`) without an actual SBOM convention (format/maintenance/storage). Release-bound evidence snapshots have only been committed since P8. PO decision 2026-07-07 (plan approval "retro-speed"): this ADR designs the structure GREENFIELD, explicitly without a migration plan for the three existing projects.

## Decision

> "In every project a standardized version control that pulls in the PRDs and other spec documents — releases reference the specifications they were built and tested against." (PO, verbatim in substance)

Specification:

- Every project maintains **`docs/releases/<version>.md`** — a release manifest per release (template: `templates/release-manifest.md`) that FREEZES, per release: PRD/spec references (links to `specs/<date>-<topic>/`), ADR deltas since the last release, the architecture-document version at release time, paths to the committed verify and security evidence snapshots, and the SBOM state/delta.
- Every project maintains a **living `docs/ARCHITECTURE.md`** (template: `templates/architecture-doc.md`) — current-state principle (no change log in the running text), version header; changes show up as a reference to the corresponding release manifest instead of being duplicated.
- **SBOM convention, two-tier:** **Baseline** (mandatory) = `third-party-licenses.json` (declared dependencies + licenses, already part of the AP1 security layer) + the osv-scanner evidence from the security-scan phase, as a proto-SBOM. **Full CycloneDX** per stack tooling is a documented OPTION for projects that need it (e.g. a client requirement) — not mandatory, no new tooling obligation for all projects.
- **Scope — GREENFIELD:** this structure applies FROM ADOPTION in a project, NO retroactive history migration. Existing projects (`<PROJECT_A>`, `<PROJECT_B>`, `<PROJECT_C>`) adopt the structure ONLY on the PO's initiative, decided per project — no automatic rollout, no pipeline-wide mandate.

## Consequences

**Positive:** for new projects the PO gets an answerable "what was built in which version" from the first session onward, without touching the three running projects or creating a migration burden; the structure builds exclusively on existing building blocks (ADR index, specs convention, SemVer tags, security evidence) instead of duplicating them.

**Negative:** another document pair to permanently maintain (`docs/releases/*.md` + `docs/ARCHITECTURE.md`) per project; without migration, the gap the PO criticized remains open indefinitely for the three existing projects, until he triggers it per project.

**Risk:** the baseline SBOM (`third-party-licenses.json` + osv-scanner) only covers what the security scan actually captures — no substitute for a full CycloneDX SBOM if a project later needs a more robust supply-chain evidence form; mitigation: the CycloneDX option is named in the ADR, not hidden.

## Rejected alternatives

- **Immediate migration of the three existing projects** — rejected; PO directive 2026-07-07 (explicitly greenfield, no history migration in this session).
- **Full CycloneDX mandatory for all projects** — rejected; forces new stack tooling without demonstrated need across all three existing projects; the baseline (already-existing building blocks) sufficiently covers the PO's "SBOM overview" requirement for the start.
- **Release manifest as a section in `docs/state.md` instead of its own file** — rejected; `state.md` is deliberately chronological/lean (ADR-0012, register entry E10) and not a release-sorted location; a dedicated, release-sorted store more directly satisfies the PO's requirement "sorted by release".

## Follow-up

Adoption by an existing project: on the PO's initiative, per project (no fixed date). CycloneDX need assessment: if a project needs a more formal SBOM (e.g. a client requirement).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0032: Projekt-Doku-Struktur — Release-Traceability, SBOM-Konvention, lebendes Architektur-Dokument (GREENFIELD)

> Agent-Pipeline v0.1.0-draft · retro-speed-Session (Folge zu AP1-TUNING) · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, PO-Direktive AP1-TUNING-Session + Plan-Freigabe „retro-speed") · **Grundlage:** PO-Direktive (wörtlich), `.claude/plans/2026-07-07-retro-speed.md` Paket G-E

## Kontext

the PO benannte live in der AP1-TUNING-Session drei Ist-Kritikpunkte an den Bestandsprojekten (<PROJECT_A>/<PROJECT_B>/<PROJECT_C>): keine Übersicht über die SBOM, keine Übersicht über die Architektur, keine belastbare Antwort auf „was wurde in welcher Version gebaut?". Die Kernforderung: eine standardisierte Versionskontrolle, die PRDs/Vorgabedokumente mitzieht — Releases referenzieren die Spezifikationen, gegen die sie gebaut und getestet wurden. Der Bestand liefert bereits Bausteine, aber nicht release-sortiert verknüpft: ADR-Struktur (`docs/adr/` + Index, per `templates/adr.md` übertragbar), Session-Dokumentation (`docs/state.md` + Dispatch-Ledger, chronologisch statt release-bezogen), die `specs/<datum>-<thema>/`-Konvention (spec/prd/evidence, ohne Tag-Verknüpfung), SemVer-Tags (dieses Repo seit `v0.2.0`, E2), sowie Proto-SBOM-Bausteine aus dem AP1-Security-Layer (`third-party-licenses.json` + osv-scanner-Evidenz, `guardrails/security.md`) ohne eine echte SBOM-Konvention (Format/Pflege/Ablage). Release-gebundene Evidenz-Snapshots gibt es seit P8 erstmals committet. PO-Entscheidung 2026-07-07 (Plan-Freigabe „retro-speed"): dieses ADR entwirft die Struktur GREENFIELD, ausdrücklich ohne Migrationsplanung für die drei Bestandsprojekte.

## Entscheidung

> „In jedem Projekt eine standardisierte Version Control, die die PRDs und andere Vorgabedokumente mitzieht — Releases referenzieren die Spezifikationen, gegen die sie gebaut und getestet wurden." (PO, wörtlich sinngemäß)

Präzisierung:

- Jedes Projekt pflegt **`docs/releases/<version>.md`** — ein Release-Manifest je Release (Template: `templates/release-manifest.md`), das pro Release EINFRIERT: PRD-/Spec-Referenzen (Links auf `specs/<datum>-<thema>/`), ADR-Deltas seit dem letzten Release, die Version des Architektur-Dokuments zum Release-Zeitpunkt, Pfade zu den committeten Verify- und Security-Evidenz-Snapshots, sowie den SBOM-Stand/-Delta.
- Jedes Projekt pflegt ein **lebendes `docs/ARCHITECTURE.md`** (Template: `templates/architecture-doc.md`) — Ist-Stand-Prinzip (kein Änderungsjournal im Fließtext), Versions-Header; Änderungen zeigen sich als Verweis auf das jeweilige Release-Manifest statt als Duplikat.
- **SBOM-Konvention**, zweistufig: **Baseline** (verpflichtend) = `third-party-licenses.json` (deklarierte Abhängigkeiten + Lizenzen, bereits Teil des AP1-Security-Layers) + die osv-scanner-Evidenz aus der Security-Scan-Phase als Proto-SBOM. **Volles CycloneDX** je Stack-Tooling ist eine dokumentierte OPTION für Projekte, die es brauchen (z. B. Auftraggeber-Anforderung) — nicht verpflichtend, kein neuer Werkzeugzwang für alle Projekte.
- **Scope — GREENFIELD:** Diese Struktur gilt AB EINFÜHRUNG in einem Projekt, KEINE rückwirkende Historien-Migration. Bestandsprojekte (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>) adoptieren die Struktur NUR auf the PO-Initiative, projekt-individuell entschieden — kein automatischer Rollout, kein Pipeline-Zwang.

## Konsequenzen

**Positiv:** the PO bekommt für neue Projekte ab der ersten Session eine beantwortbare „was wurde in welcher Version gebaut"-Frage, ohne die drei laufenden Projekte anzutasten oder eine Migrationslast zu erzeugen; die Struktur baut ausschließlich auf vorhandenen Bausteinen auf (ADR-Index, specs-Konvention, SemVer-Tags, Security-Evidenz) statt sie zu duplizieren.

**Negativ:** Ein weiteres, dauerhaft zu pflegendes Dokumentenpaar (`docs/releases/*.md` + `docs/ARCHITECTURE.md`) pro Projekt; ohne Migration bleibt für die drei Bestandsprojekte auf unbestimmte Zeit die von the PO kritisierte Lücke bestehen, bis er sie projekt-individuell anstößt.

**Risiko:** Die Baseline-SBOM (`third-party-licenses.json` + osv-scanner) deckt nur, was der Security-Scan tatsächlich erfasst — kein Ersatz für eine vollständige CycloneDX-SBOM, falls ein Projekt später eine belastbarere Lieferketten-Nachweisform braucht; Mitigation: die CycloneDX-Option ist im ADR benannt, nicht verschwiegen.

## Verworfene Alternativen

- **Sofortige Migration der drei Bestandsprojekte** — verworfen; PO-Direktive 2026-07-07 (explizit greenfield, keine Historien-Migration in dieser Session).
- **Volles CycloneDX für alle Projekte verpflichtend** — verworfen; erzwingt neues Stack-Tooling ohne belegten Bedarf in allen drei Bestandsprojekten; die Baseline (bereits vorhandene Bausteine) deckt die PO-Anforderung „SBOM-Übersicht" ausreichend für den Start.
- **Release-Manifest als Abschnitt in `docs/state.md` statt eigener Datei** — verworfen; `state.md` ist bewusst chronologisch/lean (ADR-0012, E10) und kein release-sortierter Ort; eine eigene, release-sortierte Ablage erfüllt die PO-Forderung „sortiert nach Releases" direkter.

## Wiedervorlage

Adoption durch ein Bestandsprojekt: auf the PO-Initiative, projekt-individuell (kein fester Termin). CycloneDX-Bedarfsprüfung: falls ein Projekt eine formalere SBOM braucht (z. B. Auftraggeber-Anforderung).
