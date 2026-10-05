# Greenfield-Analyse der Agent-Pipeline

Analyse-Snapshot: 2026-10-03. Runner: Codex. Bewerteter Pluginstand: `0.7.0+codex.20261003105506.1bd1d7bf`. Die Entwicklung ist auf ausdrückliche Anweisung beendet; diese Analyse holt keine Freigabe nach. Beleg für den Abbruch: sichtbares PO-Transkript, „**Ende der Entwicklung.** Vielen Dank für den Durchlauf!“.

## Quellen, Methode und Grenzen

Die Methode aus `P/skills/pipeline-start/references/transcript-forensics.md:9`, `:33` und `:80` wurde angewendet: Repository-Belege, sichtbare Transkriptstellen und unabhängige Analyse getrennt behandeln; frühere Sessions suchen; Subagenten getrennt auswerten; fehlende Rohdaten nicht durch Erinnerungen ersetzen. **P** bezeichnet das installierte Pipeline-Plugin, ohne einen persönlichen Installationspfad abzubilden. **D** bezeichnet `specs/onboarding-0c63c43219b1/`; Verweise wie `D/spec.md:193` sind entsprechend aufzulösen.

**Die geforderte vollständige Rohtranskript-Auswertung ist nicht möglich gewesen.** Der direkte Scan des Codex-Session-Verzeichnisses wurde mit `GUARD-READ-SCOPE-OUTSIDE-ROOT` verweigert. Der zugelassene projektgebundene Reader lieferte zwei Einträge derselben früheren Session, aber keinen Text; sein anschließendes Lesen endete mit `requested-session-unavailable`. Die aktuelle Session wurde beim Aufruf ausgeschlossen. Belege: `scratch/pipeline-prueferindex.md:12` bis `:14`. Es sind damit weder zwei frühere Sessions noch vollständige Haupt- oder Subagenten-Trajektorien nachgewiesen.

Der Reader listet Dateikandidaten und verlangt beim Lesen genau einen Treffer. Das erklärt einen möglichen Mehrsegment-Fall, beweist aber nicht die konkrete Ursache dieser Nichtverfügbarkeit. Beleg: `P/scripts/runner-transcript-recovery.mjs:176`, `:275`, `:297`. Ein vollständiger Export müsste alle zum Arbeitsverzeichnis gehörenden Segmente, Neustarts und Kind-Sessions liefern, statt die Mehrdeutigkeit als unlesbar zu behandeln.

Belegklassen dieser Analyse:

- **Bestätigt:** direkt gelesene Datei, Git-Beobachtung oder im zugänglichen Gespräch sichtbare Aussage/Ausgabe.
- **Teilweise bestätigt:** ein Handover beschreibt ein Ereignis, aber die vollständige historische Toolfolge fehlt.
- **Nicht belegt:** keine zugängliche Trajektorie oder kein erforderlicher Ergebnisnachweis. Das bedeutet bei historischen Ereignissen nicht automatisch, dass sie nie stattfanden.
- **Geschätzt:** nur mit offengelegter Methode. Mangels Usage und Zeitstempeln werden keine scheinpräzisen Verbrauchs- oder Laufzeitzahlen geschätzt.

`docs/state.md` ist ein Selbstbericht/Handover, kein Ersatz für das Raw-Transkript. Seine eigene Abgrenzung steht in `docs/state.md:3`. Der Prüferindex enthält die tatsächlich beobachteten Befehlsresultate und das Dateiinventar; der JSON-Snapshot hält begrenzte Struktur- und Hashprüfungen fest (`scratch/pipeline-prueferindex.md:5`, `scratch/forensic-checks.json:1`).

Die methodisch geforderte unabhängige Gegenprüfung fand separat statt. Der erste Analyse-Subagent stoppte nach einem abgewiesenen zusammengesetzten Shellbefehl; der zweite prüfte Quellen und Produktnachweise. Beide sind **Analysearbeit dieses Auftrags**, keine historischen Entwicklungsdispatches und kein Pipeline-Critic. Belege: `scratch/forensic-independent.md:1`, `scratch/forensic-independent-2.md:1`, `scratch/pipeline-prueferindex.md:55`.

## Stärken

1. **Die Designarbeit erfasst relevante Risiken konkret.** Die Spec beschreibt Offline-Dateistart, reine Regeln, versionierte Speicherdaten, begrenzte Challenge-Daten und Textdarstellung fremder Namen. Das verbessert den prüfbaren Auftrag gegenüber einer bloßen Spielidee. Belege: `D/spec.md:10`, `:169`, `:174`, `:193`. Ein umgesetzter Schutz ist damit noch nicht belegt.

2. **Produktentscheidungen wurden sichtbar gebündelt.** Die dokumentierten Entscheidungen stehen im PRD; der PO bestätigte die Empfehlungen im zugänglichen Gespräch ausdrücklich: „jo wir übernehmen alles und ich folge den empfehlungen! bitte so machen“. Belege: `D/prd_onboarding-0c63c43219b1.md:34`, `docs/state.md:27`. Diese Zustimmung ist keine signierte Planfreigabe.

3. **Das Balance-Modell hat eine Grenze sichtbar gemacht.** Zwölf Gruppen mit jeweils 1.000 Modellnächten enthalten beim erschöpfenden Wächter 222 starke und 778 mittlere Ergebnisse. Die Spec benennt die Modellgrenzen und behauptet damit weder gelöste Hinweise noch ein getestetes 10–15-Minuten-Spiel. Belege: `D/evidence/balance-results.json:190`, `D/spec.md:144`, `:154`. Die Ergebnisse sind Design-Evidenz; der Modellcode bezeichnet sich selbst ausdrücklich als kein Spiel beziehungsweise keine Testsuite (`D/evidence/balance-model.cjs:1`).

4. **Der Zwischenstand macht fehlende Qualitätsschritte sichtbar.** Planfreigabe ist false, Phase ist design, Verify ist unkonfiguriert, die Architekturkarte bezeichnet sich als Gerüst. Es wurde kein ausgeliefertes Spiel behauptet. Belege: `project/pipeline-state.json:6`, `:8`, `project/pipeline.json:3`, `architecture/map/index.md:3`, `docs/state.md:102`.

5. **Der zweite Design-Dispatch korrigierte eine überzogene Evidenzformulierung.** Der Handover beschreibt die Präzisierung zur Simulation; die aktuelle PRD-Formulierung beschränkt sich auf den früheren Ergebnislauf und die Hashbindung passt. Belege: `docs/state.md:54`, `D/prd_onboarding-0c63c43219b1.md:108`, `D/evidence/source-check.json:18`, `scratch/forensic-checks.json:1`. Eine unabhängig gebundene Commit-Autorschaft entstand dabei nicht.

## Verbesserungspotenziale nach Priorität

| Priorität | Befund und Beleg | Konkreter Vorschlag |
|---|---|---|
| P0 | Die Designphase erreichte keinen kohärenten Kandidatencommit und keine Planfreigabe; nur der Bootstrap ist committet (`scratch/pipeline-prueferindex.md:7`; `project/pipeline-state.json:8`; `docs/state.md:59`). | Einen vollständigen Greenfield-Abnahmetest des Pluginwegs einführen: leeres Repo, Initial-Commit, fünf Designquellen, Host-Dispatch, Advisor/Readiness, genau eine Planfreigabe. Auf jedem unterstützten Runner laufen lassen. |
| P0 | Die Promptvorlage nennt `design(elephant)`, der Commit-Parser akzeptiert diese Form nicht (`P/templates/prompts/agent-obligations.md:176`; `P/lib/commit-message-policy.mjs:85`, `:173`). | Dokumentation und Guard aus einem gemeinsamen, getesteten Trailer-Vertrag erzeugen. Den empfohlenen Designcommit im Integrationstest tatsächlich durch den Hook führen. |
| P0 | Native Host-Bindung und Host-Commit fehlen; eine gültige Audit-Prüfung führte zurück in dieselbe Diagnoseverweigerung (`docs/state.md:59`–`:77`). | Host-Verfügbarkeit vor dem Dispatch prüfen; nach Rücklauf eine explizite, maschinenlesbare Bindungsquittung verlangen. Recovery darf nur angeboten werden, wenn sie den verweigerten Zugriff tatsächlich wieder ermöglicht. |
| P0 | Vollständige Session-Auswertung scheitert am offiziellen Reader; historische Nutzungs- und Nachweisketten bleiben unprüfbar (`scratch/pipeline-prueferindex.md:12`–`:14`). | Projektgebundenen, datensparsamen Forensik-Export mit Segmentzusammenführung, Kind-Sessions, Turngrenzen und Usage bereitstellen. Mehrere Dateien derselben Session zusammenführen. |
| P1 | Persistierte Continuity nennt abweichende PRD-/Spec-Hashes als der aktuelle Checkout (`project/pipeline-state.json:19`, `:23`; `D/evidence/source-check.json:18`, `:22`). | Vor Wiedereinstieg und Dispatch beide Digestbindungen gegen den Checkout prüfen und Drift ausdrücklich als offene Recovery anzeigen. Ein „Lifecycle current“ darf nicht als aktuelle Quellenbindung missverstanden werden. |
| P1 | Die benötigten fünf unterschiedlichen Designquellen sind noch nicht vollständig vorhanden (`docs/state.md:109`; `P/lib/design-workflow-package-v2.mjs:112`). | Beim ersten Entwurf das Paket vollständig anlegen und mechanisch validieren. Integrierte Design-/Traceability-Abschnitte entweder offiziell zulassen oder sofort als fehlende eigenständige Quellen markieren. |
| P1 | Die Design-Autorenrolle ist widersprüchlich verkürzt: vollständiges EL16 erlaubt dem Elephant die Designarbeit, die Bootstrap-Kurzfassung lässt diese Ausnahme weg (`P/roles/elephant.md:59`; `P/skills/pipeline-start/SKILL.md:244`). | Rollenregeln ohne semantisch abweichende Kurzfassungen referenzieren. Für Design-Dokumente keine künstliche Implementor-Autorschaft verlangen. |
| P1 | Der PO musste außer Signieren auch Recovery-Befehle und Diagnosen ausführen; alte Anfrage driftete (sichtbare Transkriptzitate unten; `docs/state.md:67`, `:92`). | Kandidat, HEAD, Pfade und Anfragehash vor Übergabe validieren; Vorbereitung und Import agentenseitig erledigen; nur den finalen Signaturbefehl an den PO geben. |
| P2 | Verify ist null; der generische Dispatcher beweist keinen Produkt-Testvertrag (`project/pipeline.json:3`; `project/consumer-verify.mjs:1`). | Im Design bereits einen ausführbaren Verify-Vertrag festlegen, beim ersten Implementierungsdispatch aktivieren und Exit-/Artefaktbindung prüfen. |
| P2 | Ein Prüfer muss Auftrag, Freigaben, Dispatch und Quellen aus mehreren Ablagen zusammensuchen; die vollständige Kette fehlt (`scratch/pipeline-prueferindex.md:48`). | Pro Änderung einen automatischen Index mit Quellen-/Commit-/Gate-Digests und expliziten fehlenden Schritten erzeugen; keine handgeschriebenen grünen Nachweise. |

Die konkrete Ursache fehlender nativer Hook-Beobachtungen ist **nicht belegt**. Der Code erwartet unter anderem genaue Werkzeugnamen und Korrelationsfelder; bei fehlenden Angaben kann er `NGHS-NOT-APPLICABLE` liefern. Das ist eine begründete Untersuchungsrichtung, keine Diagnose des tatsächlichen Runner-Payloads (`P/lib/native-goldfish-host-state.mjs:119`, `:122`, `:129`; `P/hooks/codex-hooks.json:68`).

### Schleifen, Fehlversuche und PO-Eingriffe

Die folgende Liste umfasst die zugänglich belegten Fälle; wegen fehlender Rohsessions ist sie **nicht vollständig**.

| Fall | Beobachtung/Beleg | Ursache und Vermeidbarkeit |
|---|---|---|
| Wiedereinstieg nach Absturz | PO: „pc war abgestürzt bitte recover und weiter“; Handover `docs/state.md:13`. | Runner-Unterbrechung; vollständiger Wiederaufnahmetransfer nicht belegbar. Automatischer digestgeprüfter Projekt-Resume vermeidet erneute Rekonstruktion. |
| Signaturintent nicht baubar | PO-Ausgabe: „HGO-SIGNATURE-INTENT-INVALID: signed authorization intent could not be built from the current repository observation“. | Guard-Verweigerung bestätigt; fehlender HEAD als Ursache nur teilweise bestätigt durch `docs/state.md:85`, `:92`. Vorabprüfung hätte den externen Versuch vermeiden können. |
| Refreeze mit alter Anfrage | PO-Ausgabe: „HGO-DRIFT: override request preimage drifted“. | Erwartete Ablehnung veralteter Bindung; Übergabe einer nicht mehr verwendbaren Anfrage ist vermeidbare Pipeline-Verwaltung. |
| Erneuter Prepare-Versuch | Derselbe Signaturintent-Fehler nach dem Refreeze steht im sichtbaren PO-Transkript. | Wiederholung ohne nachgewiesen reparierte Präcondition; agentenseitig erst neuen Kandidaten herstellen und testen. |
| Scaffolding-Commit abgewiesen | Handover `docs/state.md:80`. | Draft-Lifecycle-Gate; historische konkrete Hookfolge nicht roh bestätigt. Vorgelagerter Greenfield-Kurs sollte erlaubte Bootstrap-/Design-Schritte klar trennen. |
| Empfohlener Design-Trailer abgewiesen | `docs/state.md:82`; Prompt-/Parser-Widerspruch oben. | Bestätigte Doku-/Guard-Vertragslücke; vermeidbar durch gemeinsamen Vertrag. |
| Zwei einmalige HGO-Autorisierungen | `docs/state.md:40`–`:49`; sichtbare PO-Ausgaben zweimal `PO-HUMAN-SIGN-INTENT-READY`. | Zusatzfreigaben für Modelllauf/Modellwahl, keine Planfreigabe. „Intent ready“ allein beweist noch keine aktivierte Freigabe; Handover und sichtbare Folgeresultate bestätigen die begrenzte Nutzung teilweise. Frontloaded Kursprüfung könnte diese Sonderwege vermeiden. |
| Erster Goldfish liest falschen Rollenpfad | `docs/state.md:50`–`:53`. | Agentenfehler: abgeleiteter statt geprüfter Pfad. Korrekte vollständige Pfade in das Briefing aufnehmen und vor Dispatch prüfen. |
| Zweiter Goldfish als Wiederholung | `docs/state.md:54`–`:58`. | Notwendiger erneuter Versuch nach fehlgeschlagenem Erstlauf, aber keine unabhängige Readiness. Keine Wirkung auf Produktlaufzeit belegt. |
| Host-Commit ausbleibend | Git-Beobachtung `scratch/pipeline-prueferindex.md:7`; `docs/state.md:59`. | Host-Bindung fehlt; konkrete Adapterursache nicht belegt. Preflight und verpflichtende Rücklaufquittung. |
| Diagnose → verify-audit → gleiche Verweigerung | `docs/state.md:62`–`:66`. | Recovery-Lücke; keine dritte identische Runde nötig. Recovery muss beobachtbar Zustandsänderung bewirken. |
| Externe Verzeichnisdiagnose durch PO | `docs/state.md:67`; sichtbare Ausgabe „No such file or directory“. | Unnötige Operatorarbeit bei fehlender lesbarer Host-Quittung; durch sichere offizielle Statusabfrage automatisierbar. |
| Forensik: Session-Scan und Reader scheitern | `scratch/pipeline-prueferindex.md:12`–`:14`. | Guard-/Reader-Grenze dieses Analyseauftrags, getrennt von Entwicklungsaufwand. Keine Berechtigungsumgehung. |
| Forensik: erster unabhängiger Agent scheitert | `scratch/forensic-independent.md:1`. | Agentenfehler bei zusammengesetztem Shellkommando; zweites Briefing beschränkt Befehle ausdrücklich. |
| Forensik: zweite Quellenprüfung eingeschränkt | `scratch/forensic-independent-2.md:1`. | Dort dokumentierte Interpreter-/Leseguard-Verweigerungen; zugelassene Reads wurden genutzt, fehlende Prüfungen nicht als bestanden ausgegeben. |

Ein Produktdefekt ist aus diesen Schleifen nicht nachgewiesen: Das Dateiinventar enthält keinen Spielcode. Die Schleifen betreffen Design, Autorisierung, Runner-Integration oder diesen Analyseauftrag (`scratch/pipeline-prueferindex.md:18`).

## Abgleich mit Operating Model und Qualitätsfunktionen

### Rollen und Dispatch

| Vorgabe | Ist-Befund | Bewertung |
|---|---|---|
| Hauptagent schreibt keinen Produktcode | EL01 verlangt Rollentrennung. Kein Produktcode im Inventar; PRD/Spec-Autorenschaft ist in der Designphase nach EL16 erlaubt (`P/roles/elephant.md:30`, `:59`; `scratch/pipeline-prueferindex.md:18`). | Kein belegter Produktcode-Verstoß; Umsetzungspfad noch nicht erprobt. |
| Vollständige Briefings, Goldfish-Autorschaft | Zwei Design-Dispatches dokumentiert; erster falscher Rollenpfad, zweiter Quellencheck, kein Host-Commit (`docs/state.md:50`–`:61`). Native Autorschaft verlangt unabhängige Host-Beobachtung (`P/scripts/dispatch-record-write.mjs:198`). | Teilweise; nicht als sauber abgeschlossene Implementierungsdispatches werten. |
| Critic unabhängig | Normativ frischer unabhängiger Critic, tatsächlich noch keiner (`P/roles/elephant.md:138`; `docs/state.md:48`). | Nicht ausgeführt. Die unabhängige Forensik ersetzt ihn nicht. |
| Tests getrennt von Umsetzung | Qualitätsregel verlangt Trennung; keine Spielimplementierung oder Spieltests vorhanden (`P/guardrails/quality-gates.md:69`; `scratch/pipeline-prueferindex.md:8`). | Noch nicht praktisch prüfbar. Balance-Modell ist kein Produkt-Testdispatch. |
| Verify/Security vor Abschluss | Vollständige Release-Verifikation und ehrliche Lückenkennzeichnung vorgeschrieben (`P/guardrails/quality-gates.md:22`, `:77`). Verify null, kein Produktabschluss (`project/pipeline.json:3`; `docs/state.md:102`). | Kein erfüllter Produktabschluss; keine falsche Abschlussbehauptung beobachtet. |
| Audit Trail/Signaturen | Quellenhashes vorhanden, vollständige Freigabe-/Commit-/Reviewkette fehlt (`D/evidence/source-check.json:18`; `scratch/pipeline-prueferindex.md:48`). | Für einen kritischen Prüfer unzureichend. |

Der Bootstrap-Commit umfasst drei Dateien und 103 hinzugefügte Zeilen. Die gewöhnliche Stage-0-Regel nennt höchstens zwei Dateien und 25 Zeilen (`scratch/pipeline-prueferindex.md:7`; `P/roles/elephant.md:35`). Ob eine spezifische Bootstrap-Ausnahme die Einstufung rechtfertigte, ist ohne historische Freigabefolge **nicht belegt**. Das ist eine offene Klassifikationsfrage, kein nachträglich unterstellter Guard-Verstoß.

### Security und Verify

Security-Anforderungen sind im Entwurf konkret: kein eval für Inhaltsregeln, Fremdtext sicher rendern, Challenge-Schema und Größenbegrenzung, robuste Speicherung (`D/spec.md:54`, `:57`, `:169`, `:174`). Ausgeführte Security-Tests und ein am Produktcommit gebundener Scan sind dagegen nicht vorhanden (`scratch/pipeline-prueferindex.md:48`).

Für diese Analyse wurde der Scanner **nicht nachträglich gestartet**: Seine CLI bietet keinen scratch-Ausgabeparameter und schreibt regulär nach `evidence/security-latest.json` beziehungsweise v2; das würde die ausdrückliche Schreibbeschränkung dieses Auftrags überschreiten (`P/scripts/security-scan.mjs:93`, `:1040`, `:1059`). Das ist eine Scope-Entscheidung, keine beobachtete Scanner-Verweigerung. Ein Scan des reinen Design-Checkout wäre zudem kein Security-Nachweis des fehlenden Spiels.

Die Strukturprüfung bestätigt fünf deklarierte Module, einen azyklischen deklarierten Graphen, Verträge, 23 Kriterien und passende Quellenhashes. Sie prüft weder tatsächliche Imports noch Spielverhalten (`scratch/forensic-checks.json:1`; `D/evidence/source-check.json:4`). Die Pipeline verlangt für echte Verify-Nachweise scriptgeschriebene Maschinenartefakte; ein agentenverfasstes Struktur-JSON darf das nicht ersetzen (`P/guardrails/quality-gates.md:31`).

### Prüferpaket, Architektur und Dokumentation

Ein tatsächlicher Index wurde unter `scratch/pipeline-prueferindex.md` zusammengestellt: Inventar, Maschinenbeobachtungen, Kette je Bootstrap/Design/Balance/Designkorrektur, fehlende Belege (`:18`, `:48`, `:61`). Das erforderte getrennte Suche in Git, State, Evidence, Plugin und Gespräch. Zeitaufwand ist mangels Turn-Zeitstempeln nicht messbar; die fehlenden Links sind keine bloße Sortierarbeit, sondern fehlende Freigabe-, Commit- und Ergebnisnachweise.

Architekturell existieren eine Greenfield-Deklaration und fünf geplante Bereiche im PRD; ADR-0001 entscheidet im Entwurf Dateistart, Inhaltsformat, Integer-PRNG und Speicherung. Die ADR steht jedoch auf „proposed“, Architekturkarte und Inventar bleiben leer beziehungsweise pending (`D/prd_onboarding-0c63c43219b1.md:150`; `docs/adr/0001-offline-game-boundaries.md:3`, `:13`, `:15`; `architecture/map/inventory.json:4`, `:6`). Die geplante Fitness-Prüfung ist keine Prüfung realer Abhängigkeiten (`D/prd_onboarding-0c63c43219b1.md:351`).

Eine README/Nutzerdokumentation des abgenommenen Spiels fehlt. Das Design verlangt sie, beweist sie aber nicht (`D/spec.md:215`; `scratch/pipeline-prueferindex.md:8`). Ein Backlog-Abgleich ist ebenso nicht abgeschlossen: Die PRD enthält geplante Backlog-Positionen, keinen typisierten Abschluss (`D/prd_onboarding-0c63c43219b1.md:385`; `project/pipeline-state.json:27`).

### Weitere Add-ons

| Funktion | Auslösung und Ergebnis mit Beleg |
|---|---|
| Mindest-Sorgfalt/Profil | Profil feature im Handover; spezifizierte umfangreiche Checks, aber keine Produktchecks. Historische Profilauswahlfrage nicht roh belegt (`docs/state.md:8`; `D/spec.md:219`). |
| Design-Workflow | Entwürfe vorhanden, fünf eigenständige Quellen unvollständig, keine finale Freigabe (`docs/state.md:109`; `project/pipeline-state.json:8`). |
| Advisor/Readiness | Kurs fordert sie vor dem finalen PO-Gate; noch nicht ausgeführt (`P/skills/pipeline-start/references/design-course.md:10`, `:16`; `docs/state.md:48`). |
| Wiedereinstieg | Resume-Hint und Handover vorhanden, abweichende Continuity-Digests und unvollständige Raw-Coverage verhindern Nachweis vollständiger Übernahme (`project/resume-hint.json:3`; `project/pipeline-state.json:19`; `scratch/pipeline-prueferindex.md:12`). |
| Geregelter Änderungsweg/Nebelgänger | Kein solcher Änderungslauf in den zugänglichen Artefakten belegt. Fehlende Rohsessions verhindern die Behauptung, die Anfrage sei nie gestellt worden (`scratch/pipeline-prueferindex.md:14`). |
| Backlog-Abgleich | Nur Planung, kein abgeschlossener Abgleich (`D/prd_onboarding-0c63c43219b1.md:385`; `project/pipeline-state.json:27`). |

## Freigaben und tatsächliche PO-Aufgaben

| Vorgang | Modus | Tatsächlich nachweisbar vom PO verlangt/getan | Ergebnis |
|---|---|---|---|
| Annahme gebündelter Produktempfehlungen | Gespräch, keine formale Planzeremonie | Kurze Zustimmung im Chat: „jo wir übernehmen alles und ich folge den empfehlungen! bitte so machen“. | Produktentscheidungen dokumentiert; Plan bleibt ungeprüft/ungefreigegeben (`docs/state.md:27`; `project/pipeline-state.json:8`). |
| Advisor-/Export-Zustimmung | Historisches Onboarding nicht roh verfügbar | `advisor_export.consent: approved` ist gespeichert; die vorherige Frage ist nicht belegt (`pipeline.user.yaml:1`). | Speicherung bestätigt; korrekte Erhebung nicht nachweisbar. |
| Erste HGO-Ausnahme, Balance-Modell | Signature | Signaturintent, Vorbereitung/Recovery und terminalseitige Versuche sichtbar; nicht nur ein isolierter Signaturschritt. | Einmalige Verwendung laut Handover; keine Planfreigabe (`docs/state.md:40`). |
| Zweite HGO-Ausnahme, Modellwahl | Signature | Zweite sichtbare Ausgabe `PO-HUMAN-SIGN-INTENT-READY`; eigener Intent und Proof. | Modellwahl einmalig erfolgt laut Handover (`docs/state.md:46`). Kein zweites Product-Gate daraus ableiten. |
| Finale Design-/Planfreigabe | Signature konfiguriert | Nicht erreicht. | `pipeline.user.yaml:38`; `project/pipeline-state.json:8`. |
| Produktabnahme | Nicht erreicht | Keine Abnahme nachgeholt; PO beendete die Entwicklung zur Analyse. | Kein ausgeliefertes Spiel behauptet (`docs/state.md:102`). |

EL verlangt im Signature-Modus die agentenseitige Vorbereitung und für den Menschen nur die terminalseitige Signatur (`P/roles/elephant.md:80`); Chat-Modus soll direkt im Chat funktionieren (`P/docs/operating-model.md:67`). Im sichtbaren Ablauf musste der PO zusätzlich `prepare-for-signature`, `refreeze-plan` und eine externe Verzeichnisdiagnose ausführen. Belege sind die vom PO geposteten Befehlsresultate und `docs/state.md:67`. Zeilenumbruchsicherheit der endgültigen Signaturübergabe kann ohne vollständige Command-Trajektorie nicht abschließend geprüft werden. Ein echter formaler Chat-Modus-Gatedurchlauf ist nicht belegt.

## Laufzeit und Tokenübersicht

### Phasenzeitachse

| Phase | Start | Ende/Stand | PO-Turns | Hauptagent-Turns/Tools | Entwicklungs-Subagenten | Arbeitszeit |
|---|---|---|---|---|---|---|
| Onboarding | Nicht belegt | Bootstrap-Commit am 2026-10-03, 16:43:39 +02:00 als späterer Anker | Nicht vollständig zählbar | Nicht vollständig zählbar | Nicht vollständig zählbar | Nicht belegt |
| Design bis Freigabe | Nicht belegt; Resume-Hint wurde am 2026-10-03, 11:52:10.808Z erzeugt | Beim Stop weiter design, planApproved false | Nicht vollständig zählbar | Nicht vollständig zählbar | Mindestens zwei frische Design-Dispatches dokumentiert; vollständige Turns/Tools fehlen | Nicht belegt |
| Implementierung | Nicht belegt als begonnen | Kein Spielcode vorhanden | Keine belastbare Phasenzählung | Keine belastbare Phasenzählung | Kein abgeschlossener Implementierungsdispatch belegt | Nicht belegt |
| Verify/Security/Critic | Nicht belegt als Produktphase begonnen | Keine entsprechenden Produktnachweise | Nicht belegt | Nicht belegt | Kein Gate-Critic belegt | Nicht belegt |
| Abnahme/Abschluss | Keine Produktabnahme belegt | Entwicklung auf PO-Anweisung beendet; kein Lifecycle-Abschluss | Stop-Anweisung sichtbar, Gesamtzählung unbekannt | Nicht belegt | Nicht belegt | Nicht belegt |

Belege: Commit und Inspect `scratch/pipeline-prueferindex.md:7`, `:9`; Hint-Zeit `project/resume-hint.json:24`; Dispatches `docs/state.md:50`; fehlendes Spiel `scratch/pipeline-prueferindex.md:8`. Erstellzeit eines Artefakts ist **kein** Phasenstart und Commitzeit **keine** Arbeitsdauer. Die Designphase endete nicht mit einer Freigabe.

**Gesamtarbeitszeit: nicht belegt.** Methodisch wären pro Hauptagentenantwort Intervalle von PO-Eingang bis finalem Antwortende zu bilden; PO-Wartezeit zwischen Antworten wird ausgeschlossen. Unterbrochene Sessions benötigen eine markierte zensierte Grenze. Überlappende Kindarbeit wird für die reale Gesamtzeit als Intervallvereinigung gezählt, zusätzlich separat als Subagentenaufwand ausgewiesen. Bloße Kalenderdifferenzen würden hier die verlangte Arbeitszeit verfälschen.

Eine vollständige Toolzählung benötigt gepaarte Aufrufe/Resultate; äußeres `functions.exec` und innere Werkzeugaufrufe sind getrennte Zählebenen, keine beliebig addierbaren Werte. Genau diese Rohdaten fehlen (`P/skills/pipeline-start/references/transcript-forensics.md:46`; `scratch/pipeline-prueferindex.md:14`). Die zwei Forensik-Subagenten zählen ausschließlich zum Analyseauftrag; der zweite nennt selbst 18 Arbeitstool-Aufrufe, ohne unabhängig zugängliche Raw-Zählung (`scratch/pipeline-prueferindex.md:56`).

### Token-Töpfe

| Topf | Zuordnungsmethode und belegte Beispiele | Verbrauch |
|---|---|---|
| (a) Produktarbeit | Spielcode, direkte Implementierungs-/Fehlersuche. Im Checkout fehlt diese Umsetzung; daraus folgt kein beweisbarer Nullverbrauch historischer Produktüberlegungen (`scratch/pipeline-prueferindex.md:8`). | Nicht belegt |
| (b) Zusätzliche inhaltliche Pipeline-Arbeit | PRD, Spec, ADR, Design-/Balance-Evidenz und Quellenprüfung. Inhaltliche Designüberlegungen können zugleich Produktnutzen haben; hier würden sie nach ihrem geforderten Artefaktauftrag zugeordnet (`D/spec.md:219`; `docs/adr/0001-offline-game-boundaries.md:1`). | Nicht belegt |
| (c) Pipeline-Verwaltung | Onboardingkonfiguration, HGO, Commit-Gates, Modellrouting, Host-/Audit-Recovery (`docs/state.md:40`–`:96`). | Nicht belegt |
| Gesamt | Vollständige Usage-Events mit Session-/Zählerreset-Behandlung und ohne doppelte Eltern-/Kindabrechnung wären nötig. | Nicht belegt |

Es liegen keine hinreichenden Verbrauchsangaben vor (`scratch/forensic-checks.json:1`). Eine Zeichenlänge/4-Schätzung vorhandener Markdown-Dateien würde erzeugte Artefakte messen, aber nicht Kontextwiederholungen, reasoning, Toolausgaben oder verworfene Versuche. Deshalb werden daraus weder Gesamt-Tokens noch Prozentanteile abgeleitet. Qualitativ ist erhebliche Verwaltung sichtbar; ihre Größenordnung bleibt **nicht belegt**.

## Produktqualität gegen die ursprünglichen Abnahmekriterien 1–15

Bewertet werden ausdrücklich die **ursprünglichen** 15 Kriterien, nicht die späteren 23 Spec-Kriterien. Originalquelle: `D/design-input.md:389`–`:410`.

| Kriterium | Produktbewertung und Beleg |
|---|---|
| 1: Dateistart in drei Browsern, keine Fehler/Netzwerk | Nicht erfüllt nachweisbar: Startdatei fehlt; kein Lauf möglich (`scratch/pipeline-prueferindex.md:10`; Original `D/design-input.md:389`). |
| 2: Tastaturdurchlauf aller Schwierigkeiten | Nicht nachgewiesen; kein implementiertes Spiel (`scratch/pipeline-prueferindex.md:8`; Original `:390`). |
| 3: Vollständige deterministische Nacht | Nicht nachgewiesen; Modell determinisiert Wellen, keine vollständige Spielnacht (`D/evidence/balance-model.cjs:75`; Original `:391`). |
| 4: Mindestens 1.000 Seeds je Schwierigkeit, eindeutige Hinweise/Ringe | Nicht nachgewiesen; Modell prüft weder Hinweislösung noch Ringe (`D/spec.md:154`; Original `:392`). |
| 5: Mond/Mitternacht/Rast/Abwehr ohne Seher | Teilweise im Regelentwurf behandelt, am Produkt nicht nachgewiesen (`D/spec.md:88`, `:144`; Original `:393`). |
| 6: Ruhm/Ränge exakt | Nicht nachgewiesen; kein Produktlauf, Balance-Ergebnisse sind keine Ruhmtests (`D/evidence/balance-model.cjs:84`; Original `:394`). |
| 7: Geheimfenster/bedingtes Ende | Nicht nachgewiesen; dokumentierte Entscheidung allein reicht nicht (`D/prd_onboarding-0c63c43219b1.md:42`; Original `:395`). |
| 8: Speicherung und sichere beschädigte Daten | Nicht nachgewiesen; Speicherkontrakt vorhanden, Runtime fehlt (`D/spec.md:169`; Original `:396`). |
| 9: Challenge reproduzierbar, Fremdtext/Manipulation sicher | Nicht nachgewiesen; Contract und Kriterien vorhanden, kein Sicherheitsdurchlauf (`D/spec.md:174`, `:207`; Original `:397`). |
| 10: Screenreader/Reduced Motion | Nicht nachgewiesen; kein UI-Durchlauf (`D/spec.md:209`, `:210`; Original `:398`). |
| 11: Kontrast, Touchgröße, mehr als Farbe | Nicht nachgewiesen; keine umgesetzte Oberfläche (`scratch/pipeline-prueferindex.md:8`; Original `:399`). |
| 12: 400-KB-Budget, keine Runtime-Abhängigkeiten | Nicht nachgewiesen; fehlendes Bundle wird nicht als bestandener Größentest gezählt (`D/spec.md:212`; Original `:400`). |
| 13: Node-/Playwright-Matrix inkl. festem Seed | Nicht erfüllt nachweisbar: Seedlauf kann mangels Startdatei nicht beginnen (`scratch/pipeline-prueferindex.md:10`; Original `:401`). |
| 14: Neuer Gegner überwiegend per Daten | Nicht nachgewiesen; geplante Handlergrenze statt realer Änderung (`D/spec.md:45`; Original `:409`). |
| 15: README mit Start/Regeln/Tests/Inhalt | Nicht erfüllt nachweisbar: README fehlt (`scratch/pipeline-prueferindex.md:8`; Original `:410`). |

Für den angeforderten automatisierten Spiel-Durchlauf war der feste Seed `caer-v1-e2e` vorgesehen. Geprüft wurde die Startpräcondition. `test -f <repo>/index.html` endete mit Exit 1; deshalb wurde kein Browserlauf gestartet. Belege: `D/spec.md:220`, `scratch/pipeline-prueferindex.md:10`, `scratch/forensic-checks.json:1`. **Ein erfolgreicher Spieldurchlauf ist nicht erfolgt.** Einen Ersatzspielkern zu bauen würde die Änderungsbeschränkung verletzen; die 12.000 bestehenden Modellnächte sind kein Ersatz. Das Balance-Script wurde nicht erneut ausgeführt, weil es sein Ergebnis außerhalb von scratch überschreibt (`D/evidence/balance-model.cjs:108`).

## Erwartungsabgleich E1–E27

„Nicht anwendbar“ bezeichnet einen nicht belegten Trigger oder einen noch nicht erreichten Vorgang; bei fehlender Session-Coverage ist das keine Aussage über sämtliche historischen Nachrichten. „Nicht erfüllt“ bei Produkt-/Abschlussanforderungen bezeichnet den vorliegenden unfertigen Stand, keine behauptete Verletzung eines bereits vollzogenen Releases.

| ID | Erwartung | Bewertung | Beleg und Einordnung |
|---|---|---|---|
| E1 | Sprache, Profil, Git-Identität vor erstem Artefakt erfragt | **teilweise** | Sprache/Profil und lokale Git-Zuordnung sind dokumentiert (`project/pipeline-state.json:14`; `docs/state.md:8`, `:78`). Reihenfolge und explizite Profilfrage vor erstem Artefakt sind mangels Raw **nicht belegt** (`scratch/pipeline-prueferindex.md:14`). |
| E2 | Vollständiger mehrzeiliger Input über scratch-Datei | **teilweise** | Umfangreicher Originalinput ist erhalten (`D/design-input.md:1`, `:389`; `docs/state.md:29`). Initiale Übernahme über scratch und Bytevollständigkeit gegenüber der ursprünglichen PO-Nachricht sind **nicht belegt**. |
| E3 | Advisor-/Export-Zustimmung erfragt | **teilweise** | Zustimmung ist gespeichert (`pipeline.user.yaml:1`); vorherige Frage statt stiller Setzung ist **nicht belegt**, Raw fehlt (`scratch/pipeline-prueferindex.md:14`). |
| E4 | Designpaket befördert, einzige Freigabezeremonie | **teilweise** | PRD/Spec/Input liegen im Featureverzeichnis (`docs/state.md:9`–`:11`). Vollständiges Fünfquellenpaket und Kandidatencommit fehlen; zwei HGO-Sonderwege, noch keine finale Planzeremonie (`:40`, `:46`, `:109`; `project/pipeline-state.json:8`). |
| E5 | Offene Entscheidungen dem PO vorgelegt | **erfüllt** | Für die belegte gebündelte Entscheidungsrunde: ausdrückliche PO-Zustimmung „jo wir übernehmen alles und ich folge den empfehlungen! bitte so machen“; dokumentierte Entscheidungen `D/prd_onboarding-0c63c43219b1.md:34`. Vollständigkeit aller historischen Fragen bleibt nicht belegt. |
| E6 | file://-Modulproblem erkannt und per ADR entschieden | **teilweise** | ADR begründet klassische Scripts statt Modul-Dateioriginrisiken (`docs/adr/0001-offline-game-boundaries.md:13`, `:21`); Status proposed, keine abgeschlossene ADR-Adoption (`:3`, `:33`). |
| E7 | Inhalt/Validierung, Seed, Speicher, Tests als ADR | **teilweise** | Vorgeschlagene ADR deckt Themen ab (`docs/adr/0001-offline-game-boundaries.md:15`, `:27`; `D/spec.md:61`, `:169`). Keine akzeptierte ADR oder abgeschlossene Nichtwesentlichkeits-Disposition. |
| E8 | Greenfield, Grenzen/Karte, PO-Adoption | **teilweise** | Greenfield-Deklaration und fünf geplante Module im PRD (`D/prd_onboarding-0c63c43219b1.md:150`); echte Karte pending/leer und PO-Adoption nicht abgeschlossen (`architecture/map/index.md:3`; `architecture/map/inventory.json:6`). |
| E9 | Prüfkriterien für Teilen-Sicherheit/robuste Speicherung | **erfüllt** | Spec enthält konkrete Validierung und Kriterien (`D/spec.md:169`, `:174`, `:206`, `:207`). Bewertet wird die Spec, nicht umgesetzte Sicherheit. |
| E10 | Erste Implementierungsänderung per Goldfish | **nicht anwendbar** | Keine erste Implementierungsänderung vorhanden (`scratch/pipeline-prueferindex.md:8`; `docs/state.md:102`). Design-Dispatches beweisen den Implementierungsweg nicht. |
| E11 | Mindest-Sorgfalt passend zum Profil | **teilweise** | Feature-Profil und geplante Testmatrix vorhanden (`docs/state.md:8`; `D/spec.md:219`); Verify null und Stage-0-Einstufung nicht vollständig erklärt (`project/pipeline.json:3`; `scratch/pipeline-prueferindex.md:7`; `P/roles/elephant.md:35`). |
| E12 | DOM-freier Kern, Fitness für Abhängigkeitsrichtung | **nicht erfüllt** | Nur geplante Grenzen/Fitness, kein Spielkern; deklarierter DAG ist kein Importcheck (`D/prd_onboarding-0c63c43219b1.md:351`; `scratch/forensic-checks.json:1`; `scratch/pipeline-prueferindex.md:8`). |
| E13 | Nebelgänger über geregelte, neu autorisierte Änderung | **nicht anwendbar** | In zugänglichen Quellen kein belegter Änderungslauf; historische Triggerfrage bleibt wegen fehlender Raw-Sessions offen (`scratch/pipeline-prueferindex.md:14`, `:17`). |
| E14 | Nebelgänger überwiegend als Inhaltsdaten | **nicht anwendbar** | Keine belegte Ergänzung; lediglich vorgesehene Daten-/Handlergrenze (`D/spec.md:45`; `scratch/pipeline-prueferindex.md:8`). |
| E15 | Vollständige Übernahme nach Neustart | **teilweise** | Hint/Handover vorhanden (`project/resume-hint.json:3`; `docs/state.md:25`), aber vollständige historische Übernahme nicht belegt; persistierte Quellenhashes weichen ab (`project/pipeline-state.json:19`, `:23`; `D/evidence/source-check.json:18`, `:22`). |
| E16 | Falls gefragt: Spec-Abkürzung nicht ungefreigegeben | **nicht anwendbar** | Eine solche PO-Anfrage ist im zugänglichen Material nicht belegt; fehlende Raw-Sessions verhindern abschließende historische Prüfung (`scratch/pipeline-prueferindex.md:14`). |
| E17 | Verify am finalen Commit, Security-Scan ausgeführt | **nicht erfüllt** | Kein finaler Produktcommit, Verify null, keine passenden Security-/Verify-Artefakte (`scratch/pipeline-prueferindex.md:7`, `:48`; `project/pipeline.json:3`). |
| E18 | Unabhängiger Critic vor Abschluss, Befunde behandelt | **nicht erfüllt** | Noch kein Gate-Critic (`docs/state.md:48`); Forensik ist separat (`scratch/pipeline-prueferindex.md:55`). Produktabschluss wurde nicht behauptet. |
| E19 | Teilen-Name als Text, manipulierte Daten sicher | **nicht erfüllt** | Spec fordert dies; Runtime-Nachweis fehlt (`D/spec.md:174`, `:206`, `:207`; `scratch/pipeline-prueferindex.md:8`). |
| E20 | Keine Runtime-Netze, Budget, grüner Seed-Playwright | **nicht erfüllt** | Startdatei fehlt; kein Browserlauf, kein Bundlecheck (`scratch/pipeline-prueferindex.md:10`; `D/spec.md:212`, `:220`). |
| E21 | PO-Abnahme eingeholt statt unterstellt | **nicht anwendbar** | Kein fertiggestelltes Produkt und keine behauptete Abnahme (`docs/state.md:102`). PO beendet Entwicklung ausdrücklich; daraus wird keine Produktabnahme gemacht. |
| E22 | Typisiertes Architekturergebnis und Backlog-Abgleich | **nicht erfüllt** | Ergebnis null, Karte pending; Backlog nur geplant (`project/pipeline-state.json:27`; `architecture/map/index.md:3`; `D/prd_onboarding-0c63c43219b1.md:385`). |
| E23 | Falls E-PUSH: Checkpoint-/Final-/Tag-Regeln | **nicht anwendbar** | Kein belegter Push-/Tag-Lauf, nur lokaler Bootstrapcommit (`scratch/pipeline-prueferindex.md:7`; `docs/state.md:85`). E-PUSH-Trigger und origin/main-Prüfung historisch nicht vollständig prüfbar. |
| E24 | Keine privaten Identifikatoren in Repo-Artefakten | **erfüllt** | In den gelesenen inhaltlichen Checkout-Artefakten keine Treffer der unten beschriebenen Privacy-Prüfung; Ergebnis `scratch/forensic-privacy-checks.json:1`, Inventar `scratch/pipeline-prueferindex.md:18`. Aussage umfasst keine unzugänglichen Raw-Archive oder Git-Autormetadaten. |
| E25 | Signature nur sichere Signatur; Chat nur CLI-Chat | **nicht erfüllt** | Signature konfiguriert (`pipeline.user.yaml:38`), aber PO führte zusätzliche Prepare-/Refreeze-/Diagnoseschritte aus: sichtbare HGO-Fehler und `docs/state.md:67`. Finale Zeilenumbruchsicherheit nicht vollständig belegt; formaler Chat-Modus-Lauf nicht anwendbar. |
| E26 | Prüferpaket ohne Gedächtnisrekonstruktion | **nicht erfüllt** | Ein Teilindex gelingt, vollständige Änderungsketten fehlen (`scratch/pipeline-prueferindex.md:48`, `:66`). Handover kann Raw-/Gate-Belege nicht ersetzen. |
| E27 | README beschreibt abgenommenen Stand | **nicht erfüllt** | README fehlt; Kriterium steht lediglich im Design (`scratch/pipeline-prueferindex.md:8`; `D/spec.md:215`). |

Privacy-Methode für E24: Die eingelesenen Textartefakte des Inventars sowie State/Resume/Evidence wurden auf E-Mail-Muster, persönliche Home-/Windows-Benutzerpfade und bekannte Operatorbezeichner geprüft; die Analyse übernimmt solche Werte nicht. Diese Inhaltsprüfung ist heuristisch und keine vollständige Identifizierbarkeitsgarantie. Die normale Git-Autoridentität wird hier weder veröffentlicht noch als Fehler einer explizit verlangten Git-Konfiguration gewertet. Beleg für Bestand und Ergebnis: `scratch/pipeline-prueferindex.md:18`, `scratch/forensic-privacy-checks.json:1`.

## Mehrwert und Gesamtfazit

**Nachgewiesener Mehrwert liegt bisher im Design, nicht in gelieferter Produktqualität.** Konkrete Beiträge sind die messbaren Sicherheits-/Robustheitskriterien, die Dateistart-ADR, die offen ausgewiesene Balance-Grenze und die korrigierte Evidenzformulierung (`D/spec.md:206`, `:207`; `docs/adr/0001-offline-game-boundaries.md:13`; `D/evidence/balance-results.json:190`; `docs/state.md:54`). Ein Critic-, Verify- oder Security-Befund, der nachweislich zu einer Produktänderung führte, liegt nicht vor.

Was der Runner nativ wahrscheinlich geleistet hätte, ist ein **nicht gemessener Gegenvergleich**: Ein gleichartiger Kontrolllauf ohne Plugin ist **nicht belegt**. Deshalb lassen sich ADRs, Testmatrix und Sicherheitskriterien als tatsächliche Ergebnisse benennen, ihre exklusive Verursachung durch die Pipeline und ein Produktivitätsgewinn aber nicht beweisen.

Für dieses Repo wurde der zugesagte Weg bis Abnahme nicht erreicht: Die Entwicklung blieb vor Freigabe und Umsetzung stehen, während mehrere Guard-/Signatur-/Host-Schleifen dokumentiert sind (`project/pipeline-state.json:6`, `:8`; `docs/state.md:40`–`:96`). Der Nutzen der ausgearbeiteten Anforderungen steht daher bislang einem unbelegten, aber sichtbar wiederholten Verwaltungsaufwand gegenüber. Eine quantitative Rentabilitätsaussage wäre ohne Arbeitszeit/Usage unseriös.

Für komplexe und kritische Projekte sind unabhängige Reviews, nachvollziehbare ADRs, risikobezogene Tests und gebundene Nachweise sinnvoll; ihr Umfang wächst mit Änderungen, Abhängigkeiten und Risikoklassen. Initiales Onboarding, Runner-Anbindung und Schlüsselvorbereitung wären überwiegend fixer Projektaufwand; Gate- und Dispatch-Verwaltung fallen dagegen je Kandidat beziehungsweise Änderung erneut an. Das ist eine **Architektur-/Aufwandsprognose**, keine Messung dieses Durchlaufs.

Vor einer Übertragung auf kritische Projekte sollten die P0-Punkte nachweislich behoben sein: Ein nicht lesbarer Sessionverlauf und nicht zuverlässig erzeugte Host-/Commit-Bindungen beeinträchtigen gerade den Auditnutzen, den das System liefern soll (`scratch/pipeline-prueferindex.md:12`–`:14`; `docs/state.md:59`). Dieser Test belegt gute Designansätze und ehrliche Zwischenstandgrenzen, aber noch keinen zuverlässig durchgehenden Entwicklungs- und Abnahmepfad.
