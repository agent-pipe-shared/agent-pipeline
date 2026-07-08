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
