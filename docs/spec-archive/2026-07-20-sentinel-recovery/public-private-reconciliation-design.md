<!-- po-language: de -->

# Design — V3 Public Core und private Entwickler-Erweiterung

Status: **PO-Entwurf; keine Implementierungs-, Merge-, Push- oder Release-Autorität**
Datum: 2026-07-20
Scope: Sentinel-Erweiterung für die Reconciliation von
`agent-pipe-shared/agent-pipeline` und `the private consumer repository`
Profil: Epic · Rigor 2 · Risiko high

## 1. Ergebnis in einem Satz

`the Public Core checkout` wird die einzige Entwicklungs- und
Releasequelle des portablen Agent-Pipeline-Produkts. Das Repository
`the private consumer repository` wird nach der Migration ein normaler privater
Consumer-/Extension-Workspace, der eine veröffentlichte Public-Core-Version
konsumiert und nur versionierbare private Projektartefakte besitzt. Rein lokale
Benutzer-, Rechner-, Secret- und Laufzeitdaten liegen außerhalb beider
Repositories in klaren User-/Repo-State-Wurzeln.

## 2. Ausgangslage und Beweislage

Die aktuelle Trennung ist nicht sauber umgesetzt:

- Public-Produktcheckout: `the Public Core checkout`, Remote
  `agent-pipe-shared/agent-pipeline`, Public `main` beim untersuchten Stand
  `9344a5a9b5f246584da1c9946d396f1bd88c1ce2`.
- Privater Checkout: `the private consumer checkout`, Remote
  `the private consumer repository`, Sentinel-Basis
  `e2255dbb18d5b10f5b3d8618546b5b2e509025c2` plus ein umfangreicher
  uncommitteter Hawkeye-/Sentinel-Kandidat.
- Die private Sentinel-Basis ist historisch ein direkter Nachfolger des
  untersuchten Public-`main`: 159 Commits voraus, kein fehlender Public-Commit
  auf dieser Linie.
- Zwischen Public `main` und der privaten Sentinel-Basis liegen 493 geänderte
  Pfade, hauptsächlich in `plugins/`, `harness/`, `specs/`, `docs/` und
  `backlog/`. Diese Arbeit wurde größtenteils mit Public-Release-Absicht
  entwickelt und ist deshalb zunächst Public-Core-Kandidat, nicht private
  Sonderlogik.
- Der lokale Public-Checkout besitzt zusätzlich einen nicht publizierten
  `feat/v0.3-reconciliation`-Stand. Er ist eine eigenständige Eingangsquelle
  und darf weder still verworfen noch pauschal in den privaten Kandidaten
  gemergt werden.
- Der private Worktree läuft praktisch als `0.2` plus manuell vorgezogene
  Multi-CLI-, V3-, Batman-, Hawkeye- und Sentinel-Arbeit. Versionsbezeichnung,
  Produktzustand und tatsächliche Capabilities sind daher derzeit nicht sauber
  deckungsgleich.

Diese Ausgangslage macht den bestehenden privaten Checkout zu einer
**Transferquelle**, nicht zur künftigen Produktquelle.

## 3. Zielbild und Eigentumsgrenze

```text
agent-pipeline-share / agent-pipe-shared/agent-pipeline
└─ Public Core
   ├─ portable V3- und Multi-CLI-Logik
   ├─ Claude-/Codex-Runner-Adapter und ehrliche Capability-Grenzen
   ├─ Plugin, Harness, Verify, Schemas, Templates und Public Docs
   ├─ generische Extension Points für private Consumer
   └─ öffentliche SemVer-, Tag-, Release- und Migrationsautorität

the private consumer repository
└─ Private Consumer / versionierte Extension
   ├─ eigene Templates, ADRs, Policies und Projektdokumentation
   ├─ private, aber zwischen eigenen Geräten teilbare Konfiguration
   ├─ private Adapter-/Extension-Quellen ohne Public-Core-Kopie
   ├─ privater Handover und private Projektentscheidungen
   └─ gebundene Abhängigkeit von genau einer Public-Core-Version

User-/PC-Pfad und Repo-private Runtime-Wurzel
└─ Nicht versionierte lokale Daten
   ├─ CLI-/Host-/Pfad-/SSH-/Tool-Konfiguration
   ├─ Secrets, HMAC-Schlüssel und private Credentials
   ├─ Cache, Locks, temporäre Daten und gerätegebundene Receipts
   └─ kandidatgebundene Repo-Runtime unter der Git-Common-Dir-Grenze
```

### 3.1 Public Core besitzt

- Produktcode unter `plugins/pipeline-core/**` und `harness/**`;
- portable Schemas, Rollen, Skills, Hooks, Guards und Capability-Inventare;
- generische V3-Routen und Same-Runner-Verträge ohne persönliche Identität;
- den dokumentierten Codex-Ersatzpfad für technische Sandbox-Abbrüche mit
  ausdrücklich schwächerer Restzusicherung;
- Public-Dokumentation, Architekturentscheidungen, Changelog, Version und
  Distribution;
- generische APIs, mit denen private Erweiterungen konfiguriert, validiert und
  gebunden werden.

### 3.2 Der private Consumer-/Extension-Workspace besitzt

- eigene versionierbare Templates, ADRs, Guidelines, Policies und
  Projektdokumentation;
- private Projektkonfiguration, soweit sie geräteunabhängig, secret-frei und
  absichtlich zwischen den eigenen Arbeitskopien teilbar ist;
- eine private `pipeline.user.yaml`-Instanz und daraus reproduzierbar erzeugte
  projektspezifische Runtime-Projektionen;
- private Adapter-/Extension-Quellen, sofern sie keinen Public-Core-Code
  duplizieren;
- privaten Handover, private Freigaben und private Projektentscheidungen;
- Erweiterungscode nur dann, wenn er persönliche oder private Anforderungen
  erfüllt und nicht als allgemeine Capability geeignet ist.

Der vorgeschlagene kanonische Git-getrackte Aufbau eines Consumer-/Extension-
Repositories ist:

```text
pipeline.user.yaml                 # portable, secret-freie Projektintention
.agent-pipeline/
├─ README.md                          # Zweck und Eigentümer der Erweiterung
├─ templates/                         # eigene versionierbare Vorlagen
├─ policies/                          # private Projekt-Policies ohne Secrets
├─ guidelines/                        # private Advisory-Guidelines
└─ extensions/                        # private Adapter-/Extension-Quellen
docs/adr/                           # langlebige Projektentscheidungen
docs/state.md                       # privater kanonischer Projekt-Handover
```

`pipeline.user.yaml` bleibt für V3 die vorhandene Source Authority; dieses
Design erfindet keinen zweiten Routing- oder Gate-Owner. Die neue
`.agent-pipeline/`-Wurzel enthält ausschließlich versionierbare Erweiterungen,
auf die `pipeline.user.yaml` oder das bestehende Governance-Manifest mit
repo-relativen Pfaden verweist. Sie enthält keinen Cache, keine Runtime-
Receipts und keine Maschinenkonfiguration. Projektdomänen-ADRs bleiben im
normalen `docs/adr/`-Pfad, damit sie nicht als internes Tooling-Detail
versteckt werden.

### 3.3 Die lokale User-/PC-Schicht besitzt

- Benutzer- und Rechnerpräferenzen wie CLI-Pfade, Hostfähigkeiten,
  SSH-Aliase, Toolpfade und lokale Energie-/Sandbox-Optionen;
- Secrets, Credentials, HMAC-Schlüssel und gerätegebundene Identitäten;
- Cache, Locks, Downloads, temporäre Daten und nicht portable Receipts;
- private Runtime-Daten, die an einen konkreten Checkout/Kandidaten gebunden
  sind, unter einer owner-only Git-Common-Dir-Wurzel;
- benutzerweite, repositoryübergreifende Konfiguration unter den nativen
  Plattformpfaden statt in einem Produktcheckout.

Der Public-Vertrag definiert logische Wurzeln und eine sichere Auflösung:

| Datenklasse | Linux/WSL | macOS | Windows | Git-Status |
| --- | --- | --- | --- | --- |
| User-Konfiguration | `${XDG_CONFIG_HOME:-$USER_CONFIG_DIR}/agent-pipeline` | `Application Support/agent-pipeline` | `%APPDATA%\\agent-pipeline` | niemals getrackt |
| User-State | `${XDG_STATE_HOME:-$USER_STATE_DIR}/agent-pipeline` | `Application Support/agent-pipeline/state` | `%LOCALAPPDATA%\\agent-pipeline\\state` | niemals getrackt |
| Cache | `${XDG_CACHE_HOME:-$USER_CACHE_DIR}/agent-pipeline` | `Caches/agent-pipeline` | `%LOCALAPPDATA%\\agent-pipeline\\cache` | niemals getrackt |
| Repo-Runtime | owner-only unter Git Common Dir | gleich | gleich | niemals getrackt |

Die symbolischen `$USER_*_DIR`-Namen stehen im Design für die jeweilige
Plattform-Standardauflösung; die Implementierung darf keine Home-Pfade aus
Chat, Repositoryinhalt oder ungeprüften Umgebungswerten zusammensetzen. Ein
expliziter Override ist nur über eine validierte User-Konfiguration zulässig.

Die heutige ungetrackte Worktree-Wurzel `.pipeline/runtime/` ist kein
Zielvertrag. Kandidat-/Checkout-gebundene Runtime wandert kontrolliert unter
die owner-only Git-Common-Dir-Wurzel; benutzerweite Runtime wandert in die
plattformnative User-State-Wurzel. Erst ein inventarisierter, getesteter
Migrationsschritt darf alte Daten entfernen.

### 3.4 Harte Negativgrenze

Die private Erweiterung besitzt keine abweichende Kopie des Public-Core-Codes.
Eine allgemein nutzbare Korrektur oder Capability entsteht zuerst im
Public-Repository. Private Entwicklung darf keine portable Produktdatei als
lokalen Fork weiterpflegen.

Persönliche Grundregeln werden nicht in Public-Dokumentation, Public-ADRs,
Public-Defaults oder Public-Prompts übertragen. Der Public Core darf nur die
neutralen Extension Points und Validierungsregeln kennen.

Secrets, absolute lokale Pfade, SSH-Identitäten, Rechnerfähigkeiten, Cache,
Locks und gerätegebundene Receipts werden auch im privaten Git-Repository nicht
versioniert. "Privates Repository" ist keine Freigabe zur Ablage lokaler
Credentials oder unnötiger personenbezogener Betriebsdaten.

## 4. Künftiges Entwicklungsmodell

### 4.1 Allgemeine Produktentwicklung

1. Arbeit beginnt in `the Public Core checkout` auf einem
   Feature-Branch von der aktuellen Public-Basis.
2. PRD/Spec, Implementierung, Verify, Security-Evidenz und Critic werden dort
   vollständig abgeschlossen.
3. Der Branch wird nach dem menschlichen Gate in Public `main` integriert.
4. Eine veröffentlichte Version oder ein exakt gebundener Public-Commit wird
   anschließend in der privaten Erweiterung aktiviert.
5. Private Consumer-Nachweise dürfen Public-Erfolg nicht ersetzen; Public-
   Nachweise dürfen private Policy-/Betriebsnachweise nicht ersetzen.

### 4.2 Private Entwicklung

1. Arbeit beginnt in `the private consumer repository`, wenn das Ziel ausschließlich
   persönliche Konfiguration oder private Erweiterungslogik betrifft.
2. Die Arbeit importiert keinen Public-Core-Quellcode und ändert keine
   Public-Produktdatei.
3. Wird während der Arbeit eine generische Lücke sichtbar, stoppt der private
   Slice. Ein neuer Public-Slice liefert die generische Korrektur zuerst.
4. Danach aktualisiert der private Slice nur seine gebundene Core-Version und
   die private Integration.
5. Versionierbare private Templates, ADRs und Policies werden auf normalen
   privaten Feature-Branches entwickelt und in das private `origin` gepusht.
6. Lokale PC-Konfiguration wird nie durch einen Git-Commit zwischen Geräten
   synchronisiert; jedes Gerät erzeugt bzw. validiert seine User-Schicht
   selbst.

### 4.3 Repository- und Remote-Rollen

- Im Public-Checkout ist `origin` das neutrale Public-Repository.
- Im privaten Checkout ist `origin` das private `roaspeci`-Repository.
- Ein optionales read-only `upstream` im privaten Checkout darf Public-
  Historie vergleichen, ist aber weder Push-Ziel noch automatische
  Merge-Autorität.
- Push-, Tag- und Release-Autorität bleibt repository- und kanalgebunden. Kein
  Remote-Name allein beweist Zielidentität oder Freigabe.
- Ein Orchestrator besitzt gemäß ADR-0019 zu jedem Zeitpunkt genau ein
  Repository als Write Target. Repositorywechsel erfolgen nur nach einem
  abgeschlossenen oder sicher geparkten Slice mit Transfer-Receipt.

### 4.4 Nutzung durch andere Anwender

- Ein normaler Anwender muss keinen Produktentwicklungscheckout besitzen. Er
  installiert oder klont eine veröffentlichte Public-Core-Version und aktiviert
  sie in seinem eigenen Projekt.
- Projektweit teilbare Konfiguration lebt im jeweiligen Projektrepository.
- Private, aber versionierbare Erweiterungen dürfen in einem separaten
  privaten Extension-Repository liegen und eine exakte Public-Core-Version
  deklarieren.
- Rechnerweite Konfiguration lebt im User-Pfad und wird vom Setup nur nach
  ausdrücklicher Wahl erstellt oder geändert.
- Das Setup zeigt für jede Datei vor dem Schreiben Datenklasse, Zielwurzel,
  Tracking-Status und Eigentümermodus an; ein No-flag-/Inspect-Lauf bleibt
  read-only.

## 5. Migrationsstrategie

### Phase A — Freeze, Inventar und wiederherstellbare Ausgangspunkte

- Keine Rebase-, Reset-, Force-Push-, Tag- oder History-Rewrite-Operation.
- Den privaten uncommitteten Kandidaten bytegenau inventarisieren; keine
  bestehende Nachtarbeit verwerfen oder pauschal committen.
- Alle relevanten lokalen und Remote-Branch-Tips, Trees, Dirty-Path-Digests,
  Versionen und Verify-Evidenz in einem sanitisierten Transfer-Manifest binden.
- Den lokalen Public-`feat/v0.3-reconciliation`-Branch als eigenen Eingang
  inventarisieren.
- Private Datenklassen markieren, bevor ein Patch, Diff oder Commit in den
  Public-Checkout übertragen wird.

### Phase B — Datei- und Commitklassifikation

Jeder veränderte Pfad und jeder zu übernehmende Commit erhält genau eine
Disposition:

| Disposition | Bedeutung | Ziel |
| --- | --- | --- |
| `public-core` | portable Produktlogik oder allgemeine Dokumentation | Public |
| `public-extension-point` | neutrale Schnittstelle für private Consumer | Public |
| `private-overlay` | persönliche/private Konfiguration oder Daten | Private |
| `generated-rebuild` | projektspezifische Projektion; nicht kopieren | im Ziel neu erzeugen |
| `superseded` | durch neueren belegten Stand ersetzt | nicht übernehmen |
| `blocked` | Herkunft, Datenschutz oder Semantik ungeklärt | keine Mutation |

Eine Dateiexistenz, ein neuerer Zeitstempel oder ein vermeintlich passender
Commit-Titel ist keine ausreichende Disposition.

### Phase C — Öffentliche V3-Integrationslinie

- Neue Public-Feature-Linie von der verifizierten Public-Basis erstellen.
- Zuerst Multi-CLI/V3-Grundlage und deterministische Tests übertragen.
- Danach Codex-Host-, Advisory-, Readiness- und Critic-Pfade einschließlich des
  PO-erlaubten Ersatzpfads integrieren.
- Anschließend Workflow-Control, Verify, Backlog, Dokument-Hooks und
  Capability-Inventar integrieren.
- Public-Dokumentation und Versionierung erst gegen den integrierten
  Produktkandidaten aktualisieren.
- Jeder Slice bleibt fokussiert testbar, reviewbar und pushbar. Kein
  493-Pfade-Big-Bang-Commit.

### Phase D — Lokalen Public-Reconciliation-Branch einordnen

- Die 26 eigenständigen lokalen Public-Commits werden gegen die neue
  Integrationslinie geprüft.
- Nicht vorhandene, weiterhin richtige Arbeit wird als eigener Slice
  übernommen.
- Bereits ersetzte Arbeit erhält `superseded` mit Evidenz.
- Konflikte werden semantisch entschieden; Commit-Anzahl oder Branch-Alter
  entscheidet nicht.

### Phase E — Private Erweiterung reduzieren

- Private Grundregeln in private Konfigurations-/Extension-Pfade verschieben.
- Public-Core-Kopien aus der künftigen privaten Entwicklungsoberfläche
  entfernen, sobald die entsprechende Public-Version gebunden ist.
- Die private Erweiterung konsumiert eine exakte Public-Version mit
  Commit-/Tree-/Manifest-Digest und prüft ihre Kompatibilität.
- Projektspezifische Runtime-Dateien werden aus der privaten Quelle frisch
  generiert, nicht aus Public oder alten Worktrees kopiert.
- Versionierbare private Projektartefakte werden in einer neuen, geschlossenen
  Verzeichnisstruktur abgelegt; lokale User-/PC-Daten werden in die native
  User-Wurzel bzw. die Git-Common-Dir-Runtime migriert.
- Die Migration erstellt für lokale Daten keine Git-Historie. Bereits
  versehentlich versionierte lokale Werte werden vor Public-Transfer und vor
  dem nächsten privaten Push dispositioniert; eine notwendige
  History-Bereinigung bleibt ein separates menschliches Hochrisiko-Gate.
- Ein Migrationstest beweist, dass eine Public-Core-Aktualisierung keine
  privaten Werte publiziert und keine private Policy verliert.

### Phase F — Sentinel und Release sauber abschließen

- Public-fähige Sentinel-Items schließen gegen den Public-Kandidaten.
- Private-only Items schließen separat gegen den gebundenen Public-Core plus
  private Erweiterung.
- Dual-Channel-Vergleiche dürfen unterschiedliche Repositories, aber keine
  unterschiedlichen Public-Core-Versionen als gleichen Produktstand melden.
- Der bisherige private Sentinel-Epic schließt erst nach beiden Ergebnissen
  und einer konsistenten Transfer-/Backlog-/State-Projektion.

## 6. Codex-Sandbox-Ersatzpfad

Der externe Codex-CLI-Sandboxdefekt ist nicht durch dieses Projekt behebbar.
Der Public Core liefert deshalb einen allgemeinen, ausdrücklich begrenzten
Fallback:

- Er wird nur nach einem technischen Sandbox-Abbruch aktiviert, der keinen
  fachlichen Befund des Childs enthält, beispielsweise `no-child`,
  `unavailable`, Transport-/stdio-/Cleanup- oder Host-Protokollabbruch.
- Ein fachlich beantworteter Fehler, ein Finding, falsche Modellidentität,
  Kandidatendrift, Policy-Verweigerung oder eine unzulässige Aktion aktiviert
  keinen weiteren Fallback.
- Der Ersatz ist genau ein frischer, eng gebriefter Same-Runner-Subagent ohne
  Chatverlauf, Handover, Implementer-Begründung, Memory, Mutation, Auto-Apply
  oder Subdelegation.
- Der Input ist refs-/pfadbegrenzt und an Kandidat, Duty, Frage und Queue-
  Revision gebunden.
- Der Status darf final und gatefähig sein, trägt aber zwingend die
  Restzusicherung `functional-equivalent-read-only; OS isolation not asserted`.
- Er behauptet weder Selected-Sandbox-Ausführung noch OS-Isolation oder
  beobachtete Modellidentität.
- Rohprompt, Rohantwort, Trace, private Koordinaten und Adapterfehler werden
  nicht dauerhaft gespeichert; nur das sanitierte Receipt bleibt.

Persönliche Aktivierungspräferenzen und lokale Hostwerte bleiben private. Der
Public Core enthält ausschließlich den neutralen Vertrag, die Reason-Code-
Matrix und die Tests.

## 6a. Public README, Nutzungserklärung und Attribution

Die Public-README erklärt die Drei-Schichten-Logik für neue und bestehende
Anwender in einem kurzen, konkreten Pfad:

1. Public Core installieren oder für Produktentwicklung klonen.
2. Projektkonfiguration und eigene versionierbare Templates/ADRs im eigenen
   Projekt oder privaten Extension-Repository halten.
3. Rechner-, User-, Secret- und Runtime-Daten ausschließlich in den dafür
   definierten lokalen Wurzeln halten.
4. Allgemeine Produktverbesserungen als Public-Feature-Branch beitragen;
   private Anpassungen nicht als Core-Fork pflegen.

Die finale Public-README muss außerdem die bereits historisch vorhandene
Acknowledgments-/Quellenpassage bewahren bzw. wiederherstellen. Mindestens
folgende geistige Grundlagen werden mit Autor/Werk und Link korrekt genannt:

- Dave Rensin, *Elephants, Goldfish and the New Golden Age of Software
  Engineering* als Quelle des EGM-/Fresh-Context-Denkmodells;
- Addy Osmani, Shubham Saboo und Sokratis Kartakis, *The New SDLC With Vibe
  Coding* als Quelle des agentischen SDLC-/Harness-Kontexts;
- weitere im historischen Acknowledgments-Abschnitt bereits benannte Werke
  werden gegen den belegten Public-Stand inventarisiert und nicht still
  entfernt.

Die Passage macht transparent, welche Konzepte übernommen, kombiniert oder
bewusst abgewandelt wurden. Sie behauptet keine Autorenschaft an den
Ursprungskonzepten und ersetzt keine Lizenz-/Attributionsprüfung.

## 7. Zustands- und Recovery-Vertrag

### Authority und Replay

- PO-Autorität genehmigt dieses Design und jeden späteren Release-/Push-Gate.
- Das Transfer-Manifest ist append-only und bindet Quell-/Zielrepository,
  Commit, Tree, Dirty-Path-Digests, Disposition und Ziel-Slice.
- Ein bereits übernommener Slice darf nur bei exakt gleichem Input idempotent
  wiederholt werden. Abweichende Bytes erfordern eine neue Revision.

### Durable Grenze

- Transfer-Manifeste und sanitierte Receipts werden im jeweils aktiven
  Write-Target gespeichert.
- Private Rohdaten oder private Pfade werden nie als Public-Transferartefakt
  geschrieben.
- Git-Commit, Ref-Update, Backlog-State und private Receipt-Speicherung werden
  nicht als dateisystemübergreifend atomar behauptet.

### Crashzustände

| Zustand | Zulässige Recovery |
| --- | --- |
| inventarisiert, nicht übertragen | Slice neu starten |
| Patch vorbereitet, Ziel unverändert | Patch verwerfen oder identisch erneut prüfen |
| Zielbytes geändert, Verify fehlt | nur denselben Slice verifizieren oder zur gebundenen Vorversion zurückkehren |
| Verify grün, Commit fehlt | Commit aus exakt gebundenen Bytes erzeugen |
| Commit vorhanden, Push fehlt | nach frischem Remote-/Gate-Readback pushen |
| Public push erfolgt, private Aktivierung fehlt | Public nicht zurückdrehen; private Aktivierung als neuen Slice fortsetzen |
| dritter/unbekannter Zustand | fail-closed, menschliches Gate |

### Selbstreferenzgrenze

Ein Transfer-Manifest darf seine eigene Wahrheit nicht aus einem von ihm
selbst geänderten State, Backlog-Status oder generierten Capability-Inventar
ableiten. Kandidat, Diff, Verify-Evidenz und Remote-Readback werden getrennt
gebunden.

## 8. Geplante Artefakte

Die Implementierungsfreigabe autorisiert noch nicht pauschal alle folgenden
Dateien. Jeder Slice erhält eine engere Dateiliste.

| Artefakt | Zielrepository | Zweck |
| --- | --- | --- |
| Public Reconciliation PRD/Spec | Public | portable Produktmigration |
| sanitisiertes Transfer-Manifest + Schema | Private zuerst, Public nur redigierte Sicht | Quell-/Zieldisposition |
| Public-/Private-Ownership-Matrix | Public: generische Klassen; Private: konkrete Pfade | Grenzprüfung |
| Transfer-/Privacy-Validator | Public | verhindert private Werte im Public-Slice |
| Public-Core-Versionsbindung | Public Schema, Private Instanz | exakter Consumervertrag |
| private Extension-Konfiguration | Private | persönliche Grundregeln |
| Public User-/Project-/Machine-Layout-Schema | Public | portable Datenklassengrenze |
| private Projektstruktur | Private | Templates, ADRs, Policies und Extensions |
| User-/PC-Migration und Permissions-Checks | Public Tooling, lokale Instanz | nicht versionierte lokale Daten |
| README-Nutzerpfad und Acknowledgments | Public | Bedienlogik und Quellenattribution |
| Migration-/Recovery-Tests | je zuständiges Repo | beweisen Replay und Fail-Closed-Verhalten |
| Sentinel-Abschlussprojektionen | getrennt | ehrlicher Public-/Private-Close |

## 9. Binäre Akzeptanzkriterien

- AC-R1: WHEN eine portable Capability geändert wird, THE SYSTEM SHALL die
  Änderung ausschließlich aus einem Public-Feature-Branch liefern.
- AC-R2: IF ein privater Slice eine Public-Core-Datei ändert, THEN THE SYSTEM
  SHALL vor der Mutation stoppen und einen Public-Transfer anfordern.
- AC-R3: WHEN ein Public-Slice vorbereitet wird, THE SYSTEM SHALL jeden
  Quellpfad genau einer Disposition zuordnen und private/ungeklärte Pfade
  ausschließen.
- AC-R4: WHEN ein Repository das Write Target ist, THE SYSTEM SHALL das andere
  Repository ausschließlich read-only behandeln und den Wechsel durch ein
  Receipt belegen.
- AC-R5: WHEN die private Erweiterung Public Core aktiviert, THE SYSTEM SHALL
  Version, Commit, Tree und Manifest-Digest exakt binden.
- AC-R6: IF Public Core und private Erweiterung unterschiedliche Core-
  Bindungen besitzen, THEN THE SYSTEM SHALL keinen gemeinsamen Release- oder
  Gleichheitsclaim erzeugen.
- AC-R7: WHEN ein Codex-Sandboxlauf technisch ohne fachliche Antwort abbricht,
  THE SYSTEM SHALL höchstens einen frischen funktionalen Ersatzlauf erlauben
  und dessen schwächere Assurance offenlegen.
- AC-R8: IF ein Sandboxlauf einen fachlichen Befund, eine Policy-Verweigerung,
  Kandidatendrift oder falsche Identität liefert, THEN THE SYSTEM SHALL keinen
  Ersatzlauf starten.
- AC-R9: WHEN ein Public-Transfer abgeschlossen wird, THE SYSTEM SHALL Full
  Verify, Security Evidence, Privacy-Scan und unabhängigen Critic an denselben
  Kandidaten binden.
- AC-R10: WHEN Sentinel schließt, THE SYSTEM SHALL getrennte belegte Public-
  und Private-Ergebnisse sowie konsistente Backlog-/State-Projektionen
  referenzieren.
- AC-R11: WHEN eine Konfiguration zwischen eigenen Arbeitskopien geteilt werden
  soll, THE SYSTEM SHALL nur secret-freie, geräteunabhängige Projektartefakte
  im privaten Repository versionieren.
- AC-R12: IF Daten Secrets, absolute lokale Pfade, Hostidentität, Cache, Locks
  oder gerätegebundene Receipts enthalten, THEN THE SYSTEM SHALL sie
  ausschließlich in der User-/PC- oder Repo-Runtime-Wurzel speichern.
- AC-R13: WHEN Setup oder Migration einen Zielpfad plant, THE SYSTEM SHALL
  Datenklasse, Zielwurzel, Tracking-Status und Eigentümermodus vor jedem
  explizit autorisierten Write anzeigen.
- AC-R14: WHEN die Public-README veröffentlicht wird, THE SYSTEM SHALL den
  Public-/Private-/User-Datenfluss und die belegten SDLC-/EGM-Quellen mit
  Autoren nennen.

## 10. Harte Stops

- ungeklärte Herkunft oder Lizenz eines zu publizierenden Pfads;
- privater Pfad, Benutzername, Remote, Schlüssel, Receipt, HMAC oder lokale
  Koordinate im Public-Kandidaten;
- ungesicherter Dirty Worktree oder fehlender Quell-Digest;
- Rebase, Reset, Force-Push, Tag-Move oder großer Merge als Abkürzung;
- gleichzeitige Schreibarbeit in beiden Repositories;
- roter Verify-/Security-/Privacy-Lauf;
- nicht disponierter Reconciliation-Commit;
- Public-Release aus der privaten Transferquelle;
- private Aktivierung einer nicht exakt gebundenen Public-Version;
- Ersatz-Sandbox-Erfolg ohne vorgeschriebene Restzusicherung.
- lokale User-/PC-Daten oder Secrets in einem privaten oder öffentlichen
  Git-Commit;
- Public-README ohne Nutzungslogik oder ohne belegte Quellenattribution.

## 11. Alternativen

| Alternative | Verworfen, weil |
| --- | --- |
| Sentinel zuerst vollständig privat schließen | macht die falsche Quelle zur Produktwahrheit und erzeugt Doppelarbeit |
| privaten Branch pauschal nach Public fast-forwarden | publiziert ungeprüfte private Zustände und umgeht die zweite lokale Reconciliation-Linie |
| beide Vollrepositories dauerhaft synchron halten | erzeugt wieder zwei Core-Quellen und permanente Mergekonflikte |
| Public Core als Subtree im privaten Repo weiterentwickeln | erlaubt erneut lokale Core-Modifikation und unklare Releaseautorität |
| private Regeln als Public-Defaults dokumentieren | vermischt persönliche Arbeitsweise mit Produktvertrag |
| alle privaten Daten im privaten Git-Repository speichern | verwechselt Zugriffsschutz mit sicherer Secret-/Hostdatenhaltung |
| lokale PC-Konfiguration als Dotfiles-Teil des Produktrepos verwalten | koppelt Geräteidentität und Produktentwicklung und erschwert sichere Migration |
| einen Sandbox-Fallback für jeden Fehler starten | dupliziert fachliche Entscheidungen und kann echte Findings umgehen |

## 12. Definition of Done

Die Reconciliation ist abgeschlossen, wenn:

1. Public Core in the Public Core die einzige portable Produktquelle ist;
2. alle relevanten Hawkeye-/Sentinel- und lokalen Public-Reconciliation-
   Änderungen dispositioniert sind;
3. die Public-V3-/Multi-CLI-/Codex-Funktion vollständig grün und releasefähig
   ist;
4. die private Erweiterung keine abweichende Public-Core-Kopie mehr pflegt;
5. die private Instanz eine exakte Public-Version konsumiert, versionierbare
   private Projektartefakte sauber von lokaler User-/PC-/Runtime-Konfiguration
   trennt und keine privaten Daten in Public gelangen;
6. beide Repositories wieder kleine, verifizierte Feature-Branches sauber
   pushen können;
7. Sentinel seine Public- und Private-Ergebnisse getrennt und ehrlich schließt;
8. Full Verify, Security/Privacy Evidence, Delta-Critic und finaler High-Risk-
   Critic für die jeweiligen Kandidaten grün sind;
9. kein Force-Push, History-Rewrite oder erfundener Abschluss verwendet wurde.
10. die Public-README Nutzung, Entwicklungsmodell, Datenwurzeln und die
    belegten SDLC-/EGM-Quellen verständlich dokumentiert.

## 13. PO-Gate

Dieses Dokument ist nur der lesbare Designentwurf. Die Umsetzung beginnt erst,
wenn der PO das Wort **`approved`** sendet. Die Freigabe bestätigt insbesondere:

1. Public Core wird die alleinige Quelle portabler Entwicklung.
2. Persönliche Grundregeln bleiben ausschließlich in der privaten
   Erweiterung.
3. Private Git-Daten werden von rein lokaler User-/PC-/Runtime-Konfiguration
   getrennt; Secrets und Hostdaten werden auch privat nicht versioniert.
4. Der private Sentinel-Kandidat ist Transferquelle und wird nicht zuerst als
   privates Produkt geschlossen.
5. Migration erfolgt in kleinen Public-Slices mit genau einem Write Target.
6. Codex darf nach rein technischen Sandbox-Abbrüchen den beschriebenen
   funktionalen Ersatzpfad verwenden; fachliche Fehler lösen ihn nicht aus.
7. Die Public-README dokumentiert die Drei-Schichten-Nutzung und stellt die
   belegte SDLC-/EGM-Attribution wieder her.
