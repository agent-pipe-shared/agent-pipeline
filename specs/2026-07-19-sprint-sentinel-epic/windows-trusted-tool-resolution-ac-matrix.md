<!-- po-language: de -->

# AC-Matrix — Sentinel #37: Trusted Tool Resolution

Status: **PO-entschieden; Implementierung und Closure offen**  
Datum: 2026-07-22  
Scope: `pipeline.windows-trusted-tool-resolution` / Live-Issue #37

## Verbindliche PO-Entscheidung

Die erste Resolver-Lane ist strikt: Sie akzeptiert nur direkte `.exe`-Dateien
in festgelegten, systemweiten Windows-Wurzeln. `.cmd`, `.bat` und
PowerShell-Wrapper sowie Repository-, Temp- und nutzerbeschreibbare Pfade sind
nicht vertrauenswürdig. Reparse-Points dürfen nur nach erneuter Prüfung ihres
Endziels akzeptiert werden. Nutzerpfade oder Wrapper brauchen eine spätere,
eigene PO-Ausnahme; sie gehören nicht zu diesem Paket.

## Akzeptanzkriterien

| AC | Nachweis vor einer Transition |
| --- | --- |
| AC-37.1 | Eine kanonische Resolver-Authority wird von Toolchain-Preflight und Security-Scan verwendet; getrennte Windows-Suchlisten dürfen nicht fortbestehen. |
| AC-37.2 | Auf Windows werden nur direkte `.exe`-Kandidaten in den freigegebenen Systemwurzeln akzeptiert; `.cmd`, `.bat`, PowerShell-Wrapper, Repository-, Temp- und Nutzerpfade werden abgelehnt. |
| AC-37.3 | Reparse-/Link-Ziele werden erneut gegen dieselbe Wurzel- und Dateipolicy geprüft; ein Link ist kein Vertrauensbeweis. |
| AC-37.4 | `binary_missing`, `untrusted_path` und `probe_error` sind unterscheidbar und fail-closed; kein abgelehnter Kandidat wird als fehlende Installation fehlklassifiziert. |
| AC-37.5 | `setup.mjs` erhält für eine bereitstehende, vertrauenswürdige Windows-Toolchain keinen Exit-Code 2 mehr; ein fehlendes oder abgelehntes Tool bleibt ein ehrlicher Bootstrap-Blocker. |
| AC-37.6 | Fokussierte Positiv-/Negativtests, registrierte Aggregate-Verify-Evidenz, Security-Evidenz, unabhängiger Critic und native Windows-Nachweis binden den Kandidaten. |

## Nicht im Paket

Keine automatische Zulassung von benutzerlokalen Paketmanagern, Wrappern oder
arbiträren `PATH`-Einträgen; keine Änderung an der Security-Gate-Strenge; kein
Backlog-Statusübergang.

## Rollback

Ein normaler Revert der Resolver- und Test-Commits stellt die vorherige
Verhaltensgrenze wieder her. Danach sind fokussierte Tests und Full Verify auf
dem Revert-Kandidaten erforderlich.
