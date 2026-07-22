<!-- po-language: de -->

# AC-Matrix — Sentinel #34/#35: Advisory-Receipt-Assurance

Status: **PO-entschieden; Implementierung und Closure offen**
Datum: 2026-07-22
Scope: erster Consumer für `pipeline.windows-directory-durability` (#34) und
`pipeline.windows-private-state-assurance` (#35): Advisory-Receipts und ihre
zugehörigen Verzeichnisse.

## Verbindliche PO-Entscheidung

Autoritätsführende Advisory-Receipts sind fail-closed: Eine nicht beobachtbare
Directory-Durability oder Private-State-Assurance ist kein Erfolg. Auf Windows
werden DACL, Owner und Reparse-Points als eigene Aussagen geprüft; POSIX-
Mode-Bits allein reichen nicht. Für die erste Lane gelten nur der konkrete
Owner als sicher; zusätzliche Principal-Ausnahmen benötigen eine eigene
PO-Entscheidung.

## Akzeptanzkriterien

| AC | Nachweis vor einer Transition |
| --- | --- |
| AC-34.1 | Receipt-Schreiben unterscheidet Pre-Rename-Fehler, bestätigte Directory-Durability und post-Rename `durability_unknown`; ein Directory-Fehler wird nicht pauschal als `EPERM` oder Erfolg behandelt. |
| AC-34.2 | Bei `unsupported` oder `durability_unknown` meldet der Autoritätspfad fail-closed einen typisierten Zustand; er stellt kein verwendbares Receipt aus. |
| AC-34.3 | Crash-/Fault-Injection-Tests belegen die exakten Bytes und den Recovery-Zustand vor und nach Rename/Directory-Sync. |
| AC-35.1 | Vor Persistenz und Readback prüft der Receipt-Pfad Datei und Elternverzeichnis auf Owner, DACL und Reparse-Points; POSIX-Mode-Bits sind nur ergänzende Evidenz. |
| AC-35.2 | `insecure`, `unavailable` und `unsupported` sind getrennte, fail-closed Resultate; insbesondere Gruppenrechte für `Everyone`, `Users` oder `Authenticated Users` sind nicht sicher. |
| AC-35.3 | Der erste Vertrag akzeptiert nur den konkreten Owner. `SYSTEM` oder Administratoren sind keine implizite Ausnahme. |
| AC-35.4 | Fokussierte POSIX-/Windows-/Negativtests, registrierte Aggregate-Verify-Evidenz, Security-Evidenz, unabhängiger Critic und native Windows-Nachweis binden den Kandidaten. |

## Grenzen und Rollback

Dieses Paket migriert nur Advisory-Receipt-Persistenz. Andere private
Autoritätsdateien werden erst nach eigener Consumer-Inventur migriert. Ein
normaler Revert der Writer-/Test-Commits ist der einzige Rollback; anschließend
folgen fokussierte Tests und Full Verify auf dem Revert-Kandidaten.

Die in `windows-trusted-tool-resolution-ac-matrix.md` gebundene geschlossene
Windows-Assurance-Registrierung umfasst auch diese Receipt-Suite; sie erweitert
keine andere Verify-Authority und ist kein Backlog-Übergang.
