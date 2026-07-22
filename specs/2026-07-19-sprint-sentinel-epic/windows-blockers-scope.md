<!-- po-language: de -->

# Sentinel-Erweiterung: native Windows-Blocker

**PO-Entscheidung:** 2026-07-22
**Quelle:** Live-readback der öffentlichen Issues `#33`–`#37` im Repository
`agent-pipe-shared/agent-pipeline`.  Die Aufnahme erzeugt weder einen
Issue-Edit noch eine Closure- oder Go-live-Behauptung.

## Zweck und Grenzen

Diese fünf Blocker erweitern Sentinel um den nativen Windows-Pfad, der vor dem
post-go-live Branch-Cut gelöst sein muss. Sie sind eigenständige offene
Backlog-Arbeit mit einer gemeinsamen Plattformgrenze, nicht bloße Labels oder
abgeleitete Erledigungsbehauptungen. `#10` und `#27` bleiben die in ADR-0043
erfassten Shared-Prerequisites; sie werden durch diese Aufnahme nicht
geschlossen oder umdefiniert.

| Issue | Kanonische Backlog-ID | Status | Kurzvertrag | Abhängigkeit |
| --- | --- | --- | --- | --- |
| `#33` | `pipeline.windows-runtime-baseline-containment` | open | Eine gemeinsame physische Host-Pfad-Containment-Primitive für V2/V3; POSIX- und win32-/UNC-/Drive-Fälle bleiben fail-closed. | unabhängig; zuerst, P0/S |
| `#34` | `pipeline.windows-directory-durability` | open | Reguläre Datei-Flushes bleiben hart; nicht verfügbare Windows-Verzeichnis-Durability wird typisiert statt als Erfolg oder pauschales EPERM behandelt. | kann parallel zu #33, P0/M |
| `#35` | `pipeline.windows-private-state-assurance` | open | POSIX-Modi und Windows-DACL/Reparse-/Owner-Nachweise werden als explizite Assurance getrennt; Authority-Records bleiben bei unavailable fail-closed. | komponiert mit #34, P0/L |
| `#36` | `pipeline.windows-verify-reproducibility` | open | Full Verify muss auf nativem Windows ohne Admin/Developer Mode grün sein, mit expliziter Capability-/Fixture-Klassifikation statt versteckter Skips. | finale Annahme nach #33–#35; #27 bleibt externes Shared-Prerequisite, P1/L |
| `#37` | `pipeline.windows-trusted-tool-resolution` | open | Eine gemeinsame, vertrauensgebundene Tool-Auflösung verhindert widersprüchliche `binary_missing`-Ergebnisse für Git/Scanner. | parallel; #36 konsumiert die Fixtures, P1/M |

## Implementierungsreihenfolge

1. `#33`: path-domain helper plus V2/V3- und native-Windows-Integrationsfälle.
2. `#34`: getrennte File-/Directory-Durability mit enger Unsupported-Klassifikation.
3. `#35`: Private-State-Assurance-Schema, Plattformadapter und zuerst
   authority-bearing Consumer.
4. `#37`: Trusted Tool Resolution als unabhängige Resolver-/Prepared-Handle-Lane.
5. `#36`: erst nach den drei Produktblockern die portable Fixture-/CI-/Summary-
   Integration; kein broad skip und keine Behauptung nativer Keep-awake-Unterstützung.

Jedes Paket benötigt vor Code eine eigene AC-Matrix, fokussierte Tests, die
registrierte Aggregate-Verify-Evidenz, Security-Evidenz und einen unabhängigen
Critic. Keine Zeile darf allein aufgrund dieses Scope-Dokuments transitionieren.

## Aufnahme-Evidenz

Der sanktionierte Writer `applySentinelScopeExtension` nimmt die fünf IDs nur
als `open` auf. Er schreibt Item-Dateien, die append-only Ledger-Initialisierung
und die generierten Projektionen über eine transaktionale Preimage-Recovery.
Der Ledger verweist auf dieses Dokument und den Kandidaten, der es enthält.
