# Bedrohungsmodell für den isolierten Codex-Critic

**Status:** Batman F1 mit Hawkeye HAW-S · Spezifikations- und Nachweisgrenze,
noch keine starke Produktivaktivierung

**Bezugsvertrag:**
[ADR-0037 — Batman bounded assurance](adr/0037-batman-bounded-assurance.md#decision)

## Aussagegrenze

Die Zwischenklasse gilt in Hawkeye nicht nur für den Critic, sondern für die
drei expliziten Codex-Read-only-Duties `advisory`, `readiness` und `critic`.
Jede dieser Pfade muss vor einem Kindprozess denselben selektierten,
netzwerkoffenen Read-only-Transport, den Profil-Readback und eine an Dispatch
und Execution gebundene Receipt verwenden. Das erweitert weder die
Input-/Netzwerkisolation noch die zulässige Assurance über die unten genannte
Zwischenklasse hinaus.

Ein Review darf vier voneinander unabhängige Aussagen führen. Jede Aussage hat
den Zustand `proven`, `disproven` oder `not-proven` und ihre eigenen
Evidenzreferenzen. Ein Beleg für eine Aussage belegt keine andere:

1. `briefingBounded`: Das Briefing benennt ausschließlich die erlaubten
   Materialien.
2. `inputConfined`: Der Critic konnte ausschließlich die materialisierten und
   vor dem Dispatch gebundenen Eingaben lesen.
3. `technicallyIsolatedReadOnly`: Eine technische Grenze hat nicht erlaubte
   Reads sowie sämtliche nicht erlaubten Writes und Netzverbindungen
   unterbunden.
4. `verdictIntegrity`: Das vollständige, schema-valide Urteil stammt aus genau
   diesem Lauf und wurde unverändert zurückgegeben.

`not-proven` wird niemals hochgestuft. `proven` und `disproven` brauchen
mindestens einen typisierten Byte-Nachweis; `not-proven` führt keine scheinbare
Evidenz. Widersprüchliche oder unbekannte Zustände sind ungültig. Die geschlossene
Maschinenform steht in
`plugins/pipeline-core/scripts/codex-isolated-critic-claims.schema.json`.

## Erlaubte Eingaben

Reviewmaterial besteht ausschließlich aus den geordnet materialisierten Bytes
der benannten Spec, dem fixierten Kandidaten-Diff, den benannten
Guardrails/Constraints und der benannten Evidenz. Jeder Eintrag wird vor dem
Dispatch durch Art, normalisierten relativen Pfad, Bytezahl und SHA-256 gebunden.
Digests sind Bindungen, kein Ersatz für Reviewmaterial.

Chatverlauf, Handover, Memory, automatisch geladene Repository-Anweisungen,
Implementor-Begründungen, globale Benutzerkonfiguration sowie nicht gelistete
Repository-Pfade gehören nicht in die isolierte Lane. Laufzeitabhängigkeiten wie
der aufgelöste Node-Binary- und Loader-Readset werden separat gebunden; sie sind
kein Reviewmaterial.

## Bedrohungen und Kontrollen

| Bedrohung | Prävention | Erkennung | Verbleibendes Risiko |
| --- | --- | --- | --- |
| Prompt-Confinement wird als Isolation ausgegeben | Getrennte Claims und geschlossene Assurance-Klassen verbieten die Ableitung technischer Isolation aus einem knappen Briefing. | Receipt und Claim-Objekt müssen den tatsächlichen Beleg je Eigenschaft nennen. | Ein Modell kann ein erlaubtes Dokument falsch interpretieren; das ist Reviewqualität, keine Grenzverletzung. |
| Kontext- oder Autoload-Kontamination | Frischer Kontext; materialisierte Input-Allowlist; Handover, Chat, Memory, User-Konfiguration und Autoload-Pfade sind ausgeschlossen. | Negativ-Canaries und Read-Denials für nicht gelistete Pfade; Input-Manifest-Digest im Receipt. | Prozessinterne Runner-Metadaten bleiben nur insoweit sichtbar, wie der Runner sie zwingend injiziert; ohne Negativbeleg bleibt `inputConfined` `not-proven`. |
| Externe Datei-Reads oder Pfadalias umgehen die Allowlist | Aufgelöste Realpfade, Root-Deny, symlink-/hardlinkbewusste Prüfung und separater Runtime-Readset. | A/B-Probes für direkte Pfade, Symlinks, Hardlinks, Elternpfade und verschobene Sensitive-Roots. | Kernel-, Mount- oder Sandbox-Änderungen nach dem Preflight invalidieren die Kompatibilität; sie werden nicht vorausgesetzt. |
| Write oder Write-then-restore | Nur frisches Output-Verzeichnis schreibbar; alle übrigen Roots read-only beziehungsweise denied. | Vorher-/Nachher-Hashes und Canaries nach jedem positiven und negativen Fall. | Ein nicht beobachteter Schreibpfad bleibt möglich, bis die Testmatrix ihn abdeckt; Nachzustand allein ist kein Präventionsbeleg. |
| Zugriff auf Credentials, SSH, Remotes oder globale Git-/User-Konfiguration | Aufgelöste HOME-, Credential-, SSH-, Git-Config- und nicht freigegebene Repository-Roots explizit außerhalb des Profils. | Denial-Probes mit synthetischen Canaries; Receipts enthalten nur redigierte Klassen. | Neu hinzukommende oder plattformspezifische Credential-Orte benötigen ein Profil-/Preflight-Update. |
| Netzwerkexfiltration | Starke Lane setzt Netzwerk technisch auf aus; `network.enabled=true` darf nur die Zwischenklasse ergeben. | Loopback-Canary und Profil-Readback; Netzwerkmodus wird digestgebunden im Receipt geführt. | Die Zwischenklasse ist ausdrücklich netzoffen und behauptet keine Input-/Netzwerkisolation. |
| Advisory-, Readiness- oder Critic-Start umgeht die Auswahl | Alle drei Codex-Read-only-Duties bauen nur aus gebundenen Dispatch-Fakten einen gemeinsamen Selector-Request; der Host darf den Adapter erst nach Exact-ID-Readback starten. | Selection-, Execution- und Duty-Receipt binden dieselbe ID, denselben Request und den Profil-Readback; Drift liefert `no-usable-review` ohne Kindprozess. | Ein Host ohne aktuelle Auswahl ist nicht nutzbar; er darf weder die bekannte netzwerkgesperrte Variante zuerst versuchen noch auf Bedienerwissen zurückfallen. |
| Child-, stdin/EOF- oder stdout/stderr-Verlust | Fixer toolfreier Payload und gebundene Prozessgruppe; A/B-Kontrolle außerhalb und innerhalb der Grenze. | Semantischer Bytevergleich von stdin/EOF, stdout, stderr und Child-Exit. | Ein grüner Minimalpayload beweist nicht jede spätere CLI-Ausgabeform; CLI-/Schema-Wechsel invalidiert das Gate. |
| Lebenszyklus-Stall wird mit lebendem PID verwechselt | Gebundene First-Event-, No-Progress- und Gesamtlaufzeit; PID-Lebendigkeit zählt nicht als semantischer Fortschritt. | Strukturierte Lifecycle-Ereignisse und Heartbeats mit neuen semantischen Bytes. | Scheduler- oder Hostdruck kann einen echten Lauf als Timeout klassifizieren; fail-closed verhindert nur einen falschen Erfolg. |
| PID-Wiederverwendung oder fremdes Cleanup | Neue eigene Prozessgruppe; vor TERM/KILL werden Gruppe und Eigentumsbindung erneut geprüft. | Cleanup-Ereignisse unterscheiden `cleanup-not-owned` und `cleanup-failed`; Fremdprozess-Canary. | Wenn Eigentum nicht beweisbar ist, bleibt der Prozess eventuell bestehen; der Review gilt dann nicht. |
| Verdict-Schemafehler, Truncation oder Replay | Geschlossenes Verdict-Schema; Lauf-/Packet-/Input-/Lifecycle-Bindungen; begrenzte Streams und eindeutige IDs. | Vollständigkeits-, Digest-, Schema-, Reihenfolge- und Replay-Prüfung vor Admission. | Digestbindung authentifiziert keinen Provider; effektive Modellidentität bleibt ein eigener Provenienzclaim. |
| Stiller Fehler erzeugt einen Erfolgsclaim | Fail-closed Terminalcodes; Erfolg verlangt schema-valides Verdict und passende Isolationsevidenz. | Coordinator unterscheidet Verdict, Schemafehler, Permission-, Setup-, Child/stdio-, Stall-, Timeout- und Cleanup-Fehler. | Coordinator-Ausfall vor persistiertem Receipt liefert keinen verwertbaren Review, auch wenn das Modell intern fertig war. |
| CLI-, OS-, WSL- oder Dateisystemdrift | Versioniertes Kompatibilitätsgate bindet exakte CLI-Version, Profilbytes, Plattform- und Dateisystemklasse. | Preflight pro Zielklasse und frischer lokaler Kompatibilitäts-Receipt. | Eine bisher ungetestete Plattform ist `unsupported` oder `diagnostic-only`, nicht implizit kompatibel. |
| Providerexport umgeht die lokale Datenfreigabe | Beide produktiven Candidate-Packet-Hosts müssen vor ihrem ersten Provider-Handoff die geschlossene V3-Policy gegen das vollständige Paket und die abgeleitete Export-View prüfen. Runner und Provider sind fest gekoppelt (`claude`/`anthropic`, `codex`/`openai`). Der Packet-Preflight materialisiert zusätzlich den exakten binären Base→Commit-Diff als private Datei im Checkout. | Der Coordinator persistiert vor Dispatch genau ein mode-0600 `pipeline.critic-export-receipt.v1` je tatsächlich gewählter Assurance-Klasse im privaten Paketverzeichnis; Export-View, Dispatch und finales Review-Receipt binden Base, Commit, Tree sowie Pfad/Bytezahl/SHA-256 des vor jedem Lifecycle-Schritt gegen `git diff` revalidierten Snapshots. | Das Receipt belegt die lokale Autorisierung, nicht Annahme oder Verarbeitung durch den Provider. Zusätzliche Host-/Provider-Safety-Gates bleiben unabhängig und sichtbar. |
| Starker Claude-Pfad fällt erst nach dem Preflight aus | Eine starke Autorisierung darf keinen schwachen Export decken. Der schwache Same-Runner-Fallback durchläuft die Policy erneut und erhält ein eigenes Receipt, bevor sein Dispatchmaterial erzeugt wird. | Getrennte `export-native.json`- und `export-fallback.json`-Receipts sowie unterschiedliche Assurance-Digests verhindern stille Umdeutung. | Ist die zweite Autorisierung nicht vollständig oder das Paket inzwischen abgelaufen, bleibt der Claimed-Lauf ohne verwertbares Review blockiert; ein Erfolg darf daraus nicht entstehen. |

## Assurance-Grenzen

- `technically-isolated` setzt alle vier bewiesenen Claims und einen grünen,
  netzwerkgesperrten starken Preflight voraus.
- `sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted`
  belegt technische Schreibsperre außerhalb des exakten Coordinator-Scratch-
  Roots und vollständige Child/stdio-Lifecycle-Daten, aber weder
  Input-Confinement noch Netzwerksperre.
- `functional-equivalent-read-only; OS isolation not asserted` bleibt genau ein
  schwacher Same-Runner-Fallback. Seine Read-only-Grenze ist vertraglich, nicht
  durch das Betriebssystem bewiesen.
- Fehlendes oder ungültiges Verdict, fehlende Grenzbelege, Stall, Timeout oder
  Cleanup-Unklarheit ergeben `no-usable-review`.

Es gibt keine stille Kaskade von stark über Zwischenklasse zu schwach, keinen
zweiten Fallback und keinen automatischen Runner-Wechsel. Die starke isolierte
Lane bleibt upstream-gated. Die V3-Exportautorität ist dagegen in beiden
bestehenden Candidate-Packet-Hosts aktiv; sie ändert weder deren technische
Isolation noch die zulässigen Assurance-Claims.
