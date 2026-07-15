---
type: workflow-improvement
status: new
created: 2026-07-16
source: PO-Hinweis zur Dokumentenmenge und lokalen Bestandsanalyse von README, Overview, Usage und Operating Model am 2026-07-16
---

# Dokumentationsarchitektur auf drei klare Einstiegsebenen konsolidieren

## Beschreibung

Die aktuelle öffentliche Dokumentation erklärt Rollen, Gesamtprozess, Gates,
Eskalation und Abschluss mehrfach: in `README.md`, `docs/overview.md`,
`docs/usage.md`, `docs/operating-model.md` und zusätzlich im Link-Index
`docs/README.md`. Allein diese fünf Dateien umfassen rund 2.500 Zeilen; die
vollständigen deutschen Referenzhälften verdoppeln mehrere Inhalte nochmals.
Das erschwert Orientierung und macht Prozessänderungen unnötig driftanfällig.

## Auslösende Situation

Während des Phase-3A-P1-Abschlusses bat der PO am 2026-07-16 um eine direkt auf
GitHub gerenderte, englische Mermaid-Gesamtübersicht. Bei der Vorbereitung
wurde sichtbar, dass eine weitere Übersicht ohne Konsolidierung nur eine neue
Kopie desselben Prozesswissens erzeugen würde. Der PO ordnete deshalb an, die
größere Bereinigung als eigenes Folgepaket in die nächste Phase zu nehmen.

## Betroffenes Artefakt

- `README.md`
- `PIPELINE_FLOW.md`
- `docs/README.md`
- `docs/overview.md`
- `docs/usage.md`
- `docs/operating-model.md`
- `docs/adr/0011-language-policy.md`
- alle internen Backlinks auf Overview und Usage
- `setup.mjs`
- `harness/scripts/check-language-canon.mjs` und zugehöriger Test
- Dokumentations- und Sprachkanon-Checks im Verify-Wrapper

## Mini-Design

Die empfohlene öffentliche Hauptachse besteht aus genau drei Ebenen:

1. **`README.md` — Quick read.** Was ist das Produkt, für wen ist es nützlich,
   welche vier Rollen gibt es und wie startet man? Keine zweite vollständige
   Prozessgrafik und keine ausführliche Betriebsanleitung.
2. **`PIPELINE_FLOW.md` — user-facing visual journey.** GitHub-native Mermaid-
   Diagramme für End-to-End-Ablauf, Gates, begrenzte Recovery und Authority-
   Grenzen; dazu nur die wenigen Befehle und Entscheidungen, die ein Nutzer im
   Alltag wirklich berührt. Diese Datei übernimmt den einzigartigen Nutzen von
   Overview und Usage, bleibt aber ausdrücklich eine gepflegte Projektion.
3. **`docs/operating-model.md` — normative technical contract.** Exakte Rollen-,
   Gate-, Trigger-, Retry-, Failover-, Evidence- und Lifecycle-Regeln. Bei
   Widerspruch gewinnt dieses Dokument beziehungsweise die darin benannte
   höhere Authority. Kein Marketing- oder Quickstart-Duplikat.

`SETUP.md` bleibt als eigenständige, zielorientierte Installationsanleitung.
Migration, Runtime-Grenze, Design-Vorstufe und optionales Deploy bleiben
solange eigenständig, wie sie jeweils eine klar andere Nutzeraufgabe lösen.
`docs/design-decisions.md` wird separat gegen die ADRs geprüft; doppelte
Begründungen sind ein Kandidat für eine spätere Zusammenführung, aber nicht
Teil eines stillen Massenlöschens.

Die Konsolidierung muss zwei bereits sichtbare Drifts zuerst auflösen: Die
README stellt Plan-Gate und Readiness in anderer Reihenfolge dar als das
Operating Model. Außerdem widersprechen sich im Operating Model die Aussage
„Deutsch ist autoritativ“, der Marker „Englisch ist autoritativ“ und die
englische Kanonentscheidung aus ADR-0011. Der neue Flow darf keinen dieser
Widersprüche kopieren; die nächste Phase entscheidet und testet eine eindeutige
Reihenfolge und Sprach-Authority.

## Vorgeschlagene Umsetzung

1. Eine Inhaltsmatrix erstellt für jeden Abschnitt aus Overview und Usage die
   Disposition `merge-to-readme`, `merge-to-flow`, `retain-specialized` oder
   `drop-duplicate`. Nichts Einzigartiges wird vor dieser Matrix gelöscht.
2. README auf den schnellen Produkt-/Adoptionspfad kürzen und alle
   Prozessdiagramme ausschließlich nach `PIPELINE_FLOW.md` verweisen lassen.
3. Die einzigartigen Alltagselemente aus Usage — Sessionstart, PO-Berührpunkte,
   Close-Befehl und kompakte Befehlstabelle — in den Flow übernehmen.
4. Die einzigartigen Erklärungselemente aus Overview — Rigor/Risk,
   Rollenabgrenzung und Review-Reihenfolge — entweder knapp in den Flow oder
   normativ ins Operating Model überführen.
5. `docs/overview.md`, `docs/usage.md` und den reinen Link-Index
   `docs/README.md` erst danach entfernen; alle Backlinks, insbesondere
   `docs/migration.md`, `docs/runtime-boundary.md`, README, `setup.mjs` und
   ADR-0011, im selben Commit aktualisieren. Falls stabile externe Links eine
   Übergangsfrist verlangen, bleiben Overview und Usage höchstens für eine
   Release als minimale Verweis-Stubs ohne kopierten Inhalt bestehen.
6. Die Sprachstrategie separat und explizit entscheiden: empfohlen ist eine
   englische kanonische Hauptachse ohne vollständige Inline-Doppelübersetzung.
   Eine deutsche Leserhilfe darf nicht wieder drei manuell synchronisierte
   Vollkopien erzeugen.

## Akzeptanzkriterien

- Ein neuer Nutzer erreicht aus der Root-README mit höchstens einer
  Zwischenstation Setup, den grafischen Gesamtprozess und das normative
  Operating Model.
- Rollen-, Gesamtfluss-, Gate- und Recovery-Erklärung haben jeweils genau eine
  gepflegte user-facing Quelle; normative Details bleiben im Operating Model.
- Overview und Usage werden erst entfernt, nachdem ihre einzigartige Information
  in einer reviewbaren Inhaltsmatrix vollständig disponiert ist.
- Alle internen Links, Überschriftenanker, Sprachkanon- und Dokumentkontrakt-
  Checks sind grün; die Mermaid-Blöcke verwenden GitHub-kompatible Syntax.
- Der hart codierte Frontdoor-Satz im Sprachkanon-Checker entspricht der neuen
  Informationsarchitektur; historische ADR-Verweise bleiben als Historie
  erkennbar und werden nicht als aktive Backlinks fehlinterpretiert.
- Die Änderung verändert keine Pipeline-Regel, kein Gate und keine Authority;
  sie ordnet und kürzt ausschließlich deren Darstellung.

## Recherchebasis

- GitHub empfiehlt für die Root-README vor allem Nutzen, Einstieg und Hilfe;
  längere Dokumentation gehört aus dem Einstieg heraus.
- Diátaxis trennt Erklärung, How-to und Referenz nach Nutzerbedarf, statt
  denselben Inhalt in mehreren Zwischenebenen zu wiederholen.
- GitLab empfiehlt eine einzelne Quelle pro Inhalt und Links statt Kopien.

## Triage (wird vom Elephant der nächsten Pipeline-Session ausgefüllt)

- **Entscheidung:** ausstehend; PO wünscht Bearbeitung in der nächsten Phase
- **Begründung:** P1 wird nicht um eine größere Informationsarchitektur-
  Migration erweitert.
- **Zuordnung (falls accepted):** nächste Phase nach P1
- **Datum:**
