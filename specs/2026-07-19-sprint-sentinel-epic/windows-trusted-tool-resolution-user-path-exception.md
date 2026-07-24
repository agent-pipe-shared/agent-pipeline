<!-- po-language: de -->

# PO-Ausnahme — Sentinel #37: Host-gebundene Wurzel-Erweiterung

Status: **PO-entschieden; implementiert**
Datum: 2026-07-24
Scope: `pipeline.windows-trusted-tool-resolution` / Live-Issue #37, Ergänzung zu
[`windows-trusted-tool-resolution-ac-matrix.md`](windows-trusted-tool-resolution-ac-matrix.md)

## Anlass

Die erste Resolver-Lane (AC-37) akzeptiert ausschließlich feste Systemwurzeln
und schließt Nutzerpfade explizit aus: "Nutzerpfade oder Wrapper brauchen eine
spätere, eigene PO-Ausnahme; sie gehören nicht zu diesem Paket." Auf dem
Windows-Entwicklungshost der Sentinel-Windows-Session liegt die real
installierte und tatsächlich genutzte Git-Installation unter
`D:\Dev\Git\Git\{cmd,bin,mingw64\bin}` — außerhalb der eingefrorenen
`WINDOWS_SYSTEM_TOOL_ROOTS`. Ohne eine Ausnahme klassifiziert die
Trusted-Tool-Resolution dieses Git als `untrusted_path`, wodurch `#36`
(natives Full Verify grün ohne Admin/Developer Mode) auf diesem Host praktisch
unerreichbar bliebe.

## PO-Entscheidung

Live im Chat am 2026-07-24 bestätigt (Antwort auf die von der Sentinel-
Windows-Session vorgelegte Entscheidung 1, Option "a"): `D:\Dev\Git\Git\cmd`,
`D:\Dev\Git\Git\bin` und `D:\Dev\Git\Git\mingw64\bin` werden der festen
`WINDOWS_SYSTEM_TOOL_ROOTS`-Allowlist als zusätzliche, host-gebundene Einträge
hinzugefügt (`plugins/pipeline-core/lib/trusted-tool-resolution.mjs`). Alle
übrigen AC-37-Eigenschaften bleiben unverändert: nur direkte `.exe`-Dateien
werden akzeptiert, `.cmd`/`.bat`/PowerShell-Wrapper bleiben abgelehnt,
Reparse-/Link-Ziele werden erneut gegen dieselbe Wurzel- und Dateipolicy
geprüft.

## Grenzen

- Diese Ausnahme erweitert ausschließlich die Wurzel-Allowlist um genau die
  drei genannten, host-spezifischen Pfade; sie ändert keine andere
  AC-37-Eigenschaft und keine Security-Gate-Strenge.
- Keine automatische Erkennung beliebiger Nutzerpfade — jede weitere
  host-spezifische Ausnahme braucht denselben expliziten PO-Entscheid.
- Kein Issue-Close, kein Release, keine Go-live-Behauptung. `#37` bleibt für
  seinen ursprünglichen, eingefrorenen Scope vollständig; diese Ausnahme
  entfernt nicht die generelle Nutzerpfad-/Wrapper-Ablehnung.

## Nachweis

Fokussierte Positiv-/Negativtests (TTR12–TTR14) in
`plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs` sowie ein
natives, nicht gemocktes Ergebnis von `resolveTrustedSystemExecutable("git")`
auf diesem Host (TTR15) binden den Kandidaten.

## Rollback

Ein normaler Revert der Allowlist- und Test-Commits stellt die vorherige
Grenze wieder her; anschließend sind die fokussierten Tests und Full Verify
auf dem Revert-Kandidaten erforderlich.
