# Kritiker-Review: Windows-Greenfield „Amon Sûl“ (29.09.2026)

> Aus der vom PO im Chat übergebenen Claude-Code-Analyse übernommen. Lokale
> Nutzer- und Transkriptpfade wurden für dieses Repository entfernt. Einzelne
> Textstellen der Übergabe waren beschädigt; die Befunde und Messwerte sind
> sinngemäß erhalten. Dies ist ein Beobachtungsbericht, kein Gate-PASS.

## Lauf und Ergebnis

| Merkmal | Beobachtung |
| --- | --- |
| Host | Windows 11; Claude Code 2.1.284, Claude Opus 5.5 |
| Plugin | `pipeline-core` `0.7.0+claude.20260929205221.c3288299` |
| Projekt | Frisches, vom PO benanntes lokales Spielprojekt |
| Endstatus | `intake-required`; kein Produktcode und kein Commit |
| Laufzeit | Rund 24 Minuten bis zum Review-Auftrag; 32 API-Aufrufe |

Der Agent erreichte nach der Einwilligung Git-Initialisierung und portable
Seed-Anlage. Die Runtime-Planung und digestgebundene Anwendung funktionierten.
Der PO beantwortete Autor, E-Mail, Freigabemodus und Sprache. Danach
verhinderten drei unabhängige Windows-/Bootstrap-Pfade den weiteren Ablauf:
Scratch-Schreiben, Wiederverwendung eines vorhandenen Signaturschlüssels und
Installation des Pre-Push-Hooks. Ein Human Override war ohne eingebundenen
Schlüssel nicht benutzbar. Zwei Versuche, den bereits im Chat vorhandenen
Intake-Text zu schreiben, wurden verworfen.

Die Review-Sitzung meldete ungefähr 28.300 Output-Tokens, 116.800
Cache-Creation-Tokens und 3,29 Mio. Cache-Read-Tokens. Diese Werte sind
Claude-Runner-Messwerte für den beobachteten Abschnitt; der Bericht enthält
keinen Produktimplementierungsaufwand. Die dortige Aufteilung in Inhaltsarbeit
und Verwaltung ist eine Schätzung.

## Befunde

### B1 — Scratch unter Windows unerreichbar

`lib/physical-scratch-boundary.mjs` wies einen absoluten Windows-Pfad des
Claude-Write-Tools mit Backslashes/Laufwerkbuchstaben ab. Relative Scratch-
Schreibversuche und PowerShell `New-Item` scheiterten ebenfalls. Die Vermutung
eines weiteren Aliasproblems beim Vergleich von `realpath(root)` ist im
Originalbericht ausdrücklich nicht verifiziert. Die Pipeline darf weder
`scratch/` ankündigen noch Intake-Text dort verlangen, wenn dieser Pfad nicht
tatsächlich schreibbar ist.

**Abnahme:** Native absolute und relative Windows-Pfade, Laufwerksschreibung
und macOS-/Unix-Aliase zulassen, ohne Symlink-Escape zu erlauben. Echte
Claude-Write- und PowerShell-Pfade im Windows-Greenfield prüfen.

### B2 — Vorhandener PO-Schlüssel über den Treiber nicht wiederverwendbar

`onboarding-init.mjs` bot `existing` mit `--existing-key` oder `fresh` an.
`po-human-approval.mjs` lehnte den Import ab, wenn im Zielordner bereits
Schlüsselmaterial lag — auch wenn der genannte Schlüssel der kanonische
`po-private.pem` dieses Ordners war. Der interne Wiederverwendungszweig ohne
`--existing-key` war durch den Treiber nicht erreichbar. Der PO lehnte eine
unnötige Neugenerierung ab.

**Abnahme:** Eine explizite, nicht kopierende Wiederverwendung mit
Fingerabdruck-/Public-Key-Readback und einem vollständig ausgegebenen
Machine-Plane-Befehl. Kein Überschreiben eines fremden oder abweichenden
Schlüssels; Windows- und Unix-Tests.

### B3 — Bootstrap-Notausgang hängt vom noch nicht eingebundenen Schlüssel ab

Der Guard bot für gesperrte Bootstrap-Aktionen einen Ed25519-Human-Override.
Dieser war bei B2 nicht nutzbar und machte aus einem lokalen Onboarding-Fehler
eine Sackgasse.

**Abnahme:** Eng begrenzter, interaktiver, auditierter Host-Recovery-Pfad für
die Bootstrap-Phase, der noch keinen konfigurierten Trust Anchor voraussetzt.
Er darf keine allgemeine Source-/Guard-Schreibfreigabe sein und muss nach
erfolgreicher Schlüsselbindung enden.

### H1 — Pre-Push-Hook-Installation scheitert unter Windows

`lib/git-hook-runtime-snapshot.mjs` synchronisierte eine neu geschriebene
Datei über einen Read-only-Deskriptor. Windows `FlushFileBuffers` kann dabei
`EPERM` liefern; der Lauf zeigte einen rohen Stacktrace. Zusätzlich gab die
Pre-Push-Hook-Offerte einen relativen Plugin-Skriptpfad aus, der im Consumer-
Repository nicht ausführbar war. Das deklarierte blocking Push-Gate blieb
dadurch ohne Hook-Backstop.

**Abnahme:** Windows-tauglicher Datei-Sync, typisierte Fehlerantwort und eine
aus dem Consumer-Repository direkt ausführbare absolute Aktion. Windows-
Hostprüfung für Install/Readback/Push-Blockade.

### H2 — Passive externe Reads folgen widersprüchlichen Regeln

Der Claude-Lauf beobachtete gesperrte externe `ls`-/Glob-/PowerShell-Leseaufrufe
und erlaubte Read/Grep-Aufrufe. Er empfahl, alle externen Reads zu sperren.
Diese Empfehlung widerspricht der dokumentierten PO-Entscheidung vom 10.09.
und der erneuten PO-Anweisung in dieser Session: Geschlossen klassifizierte
passive Reads dürfen vom Host sichtbare Nutzerpfade lesen. Der Defekt ist die
inkonsistente Klassifizierung, nicht das Zulassen eines externen Markdown-
Berichts. Schlüsselmaterial benötigt eine eigene, explizite Schutzregel;
allgemeine passive Reads dürfen nicht versehentlich mutieren oder ausführen.

**Abnahme:** Einheitliche Bash-, PowerShell- und native Read/Grep/Glob-Regel
für alle drei Runner; weiterhin geschlossene Befehlsgrammatik, keine
Schreib-/Ausführungsumgehung und explizite Tests für Schlüsselpfade.

### H3 — Vermutete schwankende Zulassung, nachgeprüft

Die beiden gemeldeten Aufrufe hatten verschiedene Argumente: `existing` mit
kanonischem `po-private.pem` war zugelassen und scheiterte im Setup;
`existing` mit `none` war weder die ausgegebene Aktion noch nach dem CLI-
Vertrag gültig. Das ist kein belegter Lifecycle-Guard-Defekt. Ein neuer Test
prüft die tatsächlich ausgegebene `applyAction` für alle drei Runner und hält
die ungültige Near-Miss-Form gesperrt.

### M1–M7 — Weitere Befunde

1. **Sprache:** `INITIAL-ANSWERS-APPLIED language: de`, aber
   `pipeline.user.yaml` zeigte `language.human_facing: en`. Zu prüfen ist, ob
   diese Felder verschiedene Zwecke haben oder eine Projektion falsch ist.
2. **Datenexport:** `advisor_export.consent: approved` wurde ohne PO-Antwort
   gesetzt; das ist bestätigt. Die Critic-Allowlist bezeichnet nur technisch
   zulässige Pakete und Provider. Der native Critic-Export braucht zusätzlich
   einen separaten Consent-Beleg.
3. **Runner-Artefakte:** Ein reines Claude-Projekt erhielt `.codex/*` und eine
   Diagnose zu fehlenden Codex-Runtime-Targets. Prüfen, ob das deklarierte
   Drei-Runner-Profil dies absichtlich verlangt oder unnötig projiziert.
4. **Preflight:** `pipeline-governance-inactive` lieferte nur einen Opt-in-
   Hinweis. Nach erteilter Einwilligung fehlte eine direkt ausführbare
   Onboarding-Aktion.
5. **Intake-Text:** Bereits im Chat vorhandenes Material musste erneut
   wortgetreu als Tool-Argument gesendet werden; zwei gescheiterte Versuche
   kosteten laut Bericht je etwa 7.000 Output-Tokens. Ein sicherer, explizit
   freigegebener Verweis-/Capture-Pfad wäre effizienter.
6. **Ausgabevolumen:** `pendingAsks` erschien doppelt; Guard-Sperren enthielten
   lange Inline-Override-Anleitungen. Kompakte Fehlercodes mit abrufbaren
   Details sollen den Kontext schonen.
7. **Skill-Größe:** Der Pipeline-Start-Skill enthielt ungefähr 10.000 Tokens
   und umfangreiche Abschnitte für andere Runner. Runner-spezifische
   Referenzen sollen nur bei Bedarf geladen werden.

Niedriger priorisierte Symptome sind der rohe `EPERM`-Stacktrace und die
falsche Guard-Zusage, Scratch-Schreiben bleibe erlaubt, solange B1 besteht.

## Positivbeobachtungen und Grenzen

Vor der Pipeline-Einwilligung wurde keine Projektwirkung beobachtet. Der
Treiber fragte PO-Werte ausdrücklich ab. Runtime-Plan und Apply waren
digestgebunden. Die Schreibseite sperrte die getesteten Root-Schreibversuche,
Shell-Operatoren und `git push` im Status `intake-required`. Es wurde keine
Implementierung, kein Critic-Produktreview und kein Release-Gate erreicht.
Diese Negativproben belegen keine umfassende Sicherheitsgarantie.

## Nachhaltige Wiederholungsprüfung

- Windows-, macOS- und Linux-Smokes für Scratch, Trust-Anchor-Reuse,
  Pre-Push-Hook und die drei Runner-Grenzen.
- Ein Greenfield-Onboarding mit höchstens zwei PO-Antwortrunden und einem
  gemessenen Zeit-/Tokenbudget; die Qualität der finalen Autoritätsbindung
  darf dabei nicht sinken.
- Nach den Reparaturen einen frischen Windows-Claude-Test bis zu mindestens
  einer Produktdatei und einem echten Verify-Readback durchführen. Die
  ursprüngliche Testsession endete bei `intake-required` und darf nicht als
  erfolgreiche Abnahme umgedeutet werden.
