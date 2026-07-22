<!-- po-language: de -->

# Sentinel Platform-Support-Contract

**Status:** verbindliche Sentinel-Autorität, 2026-07-22. Dieser Vertrag
definiert, wann eine konkrete Fähigkeit auf Windows, Linux, WSL oder macOS als
unterstützt bezeichnet werden darf. Er schließt kein Backlog-Item, ersetzt keine
plattformspezifische AC-Matrix und erweitert keine Laufzeitberechtigung.

<!-- windows-blockers-scope-sha256: 4a4c85c93389a40ec5c0388156f8c062131bce7521aaa3b4cdf9267bae1ddc79 -->

Der gebundene Input ist die benachbarte
[`windows-blockers-scope.md`](windows-blockers-scope.md). Ihre fünf offenen
Windows-Blocker bleiben unverändert offen. Der PRD bindet diesen Vertrag; damit
ist die Kette **PRD → Platform-Support-Contract → Windows-Blocker-Scope**
bytegenau. Eine Änderung eines Inputs invalidiert die daraus abgeleitete
Plattform- oder Go-live-Aussage bis die gebundene Kette und ihre Evidenz erneut
geprüft sind.

## Geltungsbereich und Begriffe

Eine **Fähigkeit** ist ein eng benannter Produktpfad mit Version, Konfiguration,
Rechten, Dateisystemklasse und Sicherheitsgrenze, etwa native Full Verify,
Directory-Durability oder Private-State-Assurance. „Plattform unterstützt"
ohne diese Fähigkeit ist keine zulässige Produktbehauptung.

Die Zielklassen dieses Vertrags sind **Windows**, **Linux**, **WSL** und
**macOS**. WSL ist stets eine eigene Klasse: mindestens die Varianten
`wsl-native` und `wsl-drvfs` sind voneinander sowie von Windows und Linux zu
trennen. Ein Ergebnis für eine Variante gilt nicht stillschweigend für eine
andere.

**Native same-surface evidence** bedeutet Evidenz auf derselben Zielklasse und
derselben Oberfläche, auf der die Fähigkeit beansprucht wird: gleicher
Produktkandidat, tatsächliches Betriebssystem und Dateisystem, derselbe
privilege-/standard-account-Modus, derselbe Runner/Host und dieselbe relevante
Tool-/Sandbox-Konfiguration. Cross-compile, Unit-Mock, Emulator oder ein
anderer Host können einen Testfall erklären, aber keine native Unterstützung
attestieren.

Docker ist aktuell **out of scope**. Ein Containerresultat darf eine
Containerfähigkeit als diagnostisch beschreiben, ersetzt aber niemals native
same-surface evidence für Windows, Linux, WSL oder macOS. Insbesondere wird
ein Linux-Container weder zu Windows- noch zu macOS- oder WSL-Evidenz und
beweist keine Host-Dateisystem-, DACL-, Cgroup-, Sandbox- oder
Standard-Account-Eigenschaft.

## Zulässige Capability-Status

Jeder Plattform-/Fähigkeitsrecord verwendet genau einen dieser Status:

| Status | Aussage und Wirkung |
| --- | --- |
| `supported` | Alle Kriterien dieses Vertrags sind für die konkrete Oberfläche am aktuellen Kandidaten erfüllt. |
| `conditionally-supported` | Unterstützt nur mit ausdrücklich im Record genannten Voraussetzungen; fehlende Voraussetzung ist kein Erfolg. |
| `diagnostic-only` | Beobachtung oder Fixture vorhanden, aber keine Support-Zusage. |
| `blocked` | Benannte offene Abhängigkeit oder AC verhindert die Zusage. |
| `unavailable` | Die Fähigkeit oder der erforderliche Nachweis ist auf dieser Oberfläche nicht verfügbar; fail-closed. |
| `unsupported` | Die Fähigkeit liegt außerhalb des freigegebenen Produktumfangs. |
| `ambiguous` | Plattformklasse, Filesystem- oder Hostgrenze wurde nicht ausreichend beobachtet; fail-closed. |

`blocked`, `unavailable`, `unsupported` und `ambiguous` sind typisierte
negative, nicht als Erfolg wiederverwendbare Outcomes. Ein Fallback, ein
Best-effort-Lauf oder ein Ergebnis auf einer anderen Klasse darf sie nicht in
`supported` oder `conditionally-supported` umdeuten. Wo ein Produktadapter
einen detaillierteren Code führt, muss er ihn zusätzlich zum vorstehenden
Status erhalten, etwa `native-evidence-missing`, `platform-unavailable`,
`standard-account-gate-failed`, `filesystem-class-ambiguous` oder
`security-evidence-unavailable`.

## Gegenwärtige, ehrliche Baseline

Der Vertrag nimmt alle vier Klassen in den Support- und Evidenzumfang auf; das
ist **keine** Behauptung, dass jede aktuelle Fähigkeit auf jeder Klasse bereits
unterstützt ist.

| Zielklasse | Aktueller, zulässiger Stand |
| --- | --- |
| Windows | Die fünf gebundenen nativen Windows-Blocker sind offen. Es gibt derzeit keinen aus diesem Vertrag ableitbaren `supported`-Claim für ihre betroffenen Fähigkeiten; fehlende native Evidenz bleibt `blocked` oder `unavailable`. |
| Linux | Bestehende Linux-Kontrollen können nur capability-spezifisch und unter den jeweiligen Voraussetzungen als `conditionally-supported` erscheinen. Sie übertragen keine Zusage auf WSL, Windows oder macOS. |
| WSL | Der Status ist ohne explizite Variante, Host-/Filesystem-Observation und same-surface evidence `ambiguous`. WSL erbt weder Linux- noch Windows-Unterstützung. |
| macOS | Für nicht nativ belegte Fähigkeiten ist der Status `unavailable`. Ein Mock eines macOS-Pfads oder Resolver-Tests ist keine native macOS-Unterstützung. |

## Evidenz- und Abschlusskriterien

Ein `supported`- oder `conditionally-supported`-Record muss für denselben
aktuellen Kandidaten und dieselbe capability-surface gemeinsam belegen:

1. native same-surface evidence einschließlich der positiven und der relevanten
   negativen/fail-closed Fälle;
2. fokussierte, registrierte Tests und ein erfolgreicher Full Verify über
   `node harness/scripts/verify.mjs`; die maschinelle Verify-Evidenz muss den
   Kandidaten binden;
3. aktuelle Security-Evidenz für denselben Kandidaten. Ein fehlender,
   übersprungener, roter oder nicht bindbarer Security-Lauf ist
   `security-evidence-unavailable` und kein Support-Erfolg;
4. einen frischen unabhängigen Critic für den Plattform-/Security-relevanten
   Diff. Ist native Critic-Isolation nicht verfügbar, gilt ausschließlich die
   bestehende PO-autorisierte funktionale Äquivalenz mit der wörtlichen
   Einschränkung `functional-equivalent-read-only; OS isolation not asserted`;
   sie behauptet keine native Plattform- oder Isolations-Evidenz;
5. die zugehörige AC-Matrix, offene Prerequisites und erforderliche
   Human-/PO-Gates. Ein offener Blocker bleibt ein `blocked`-Record und darf
   nicht durch dokumentierte Absicht geschlossen werden.

Die Evidenz ist nicht portabel: Ein grüner Linux-, WSL-, macOS- oder
Windows-Lauf erfüllt ausschließlich den Record der nachgewiesenen Klasse und
Oberfläche. Der vollständige Sentinel-Close benötigt deshalb für jede als
unterstützt behauptete Fähigkeit den passenden Record; eine fehlende Klasse
ist sichtbar als negativer Status zu führen, nicht zu verschweigen.

## Änderungs- und Dokumentationsregel

Neue Plattformfähigkeiten oder Änderungen an Status, Voraussetzungen,
Filesystemklasse, Tool-Trust oder Sicherheitsgrenze aktualisieren zuerst
diesen Vertrag und die einschlägige AC-Matrix. Danach werden die eingebundenen
SHA-256-Werte vom geänderten Byteinhalt neu berechnet und Verify/Security/Critic
am neuen Kandidaten wiederholt. Kein Digest, kein Dokument und keine
Container-Evidenz ersetzt diese Reihenfolge.
