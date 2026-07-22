<!-- po-language: en -->

# PRD — Sprint Sentinel: Backlog-Wahrheit und Go-live

> Product Review Document für das PO-Gate. Status: `PO-freigegeben;
> Implementierung mit dokumentierter Readiness-Ausnahme freigegeben`. Task:
> `sprint-sentinel-epic` · Profil `epic` · Rigor 2 · Risiko high. Die Freigabe
> bestätigt die Entscheidungen 1A–8A und die am 2026-07-20 genehmigte
> Public-Core-/Private-Consumer-Reconciliation. AFK-Aktivierung, Push, Tag und
> Release bleiben bis zu ihren jeweiligen Gates gesperrt.

<!-- technical-spec-sha256: aaec0b6411626b3f1988dbd2f5db16b2870c9aaed07e5edd3ed1e1e735c43b9b -->
<!-- public-private-reconciliation-design-sha256: 48698f4bc1717932b1f031b6936e7201cc1d3201e6e56d28a50b2891023f0e7f -->
<!-- platform-support-contract-sha256: f49a4e59c968139fe0a09c22e99905fb9a1b6d30354966ffd2f36b39e3501782 -->

Die technische Freigabebindung gilt exakt für die benachbarte
[spec.md](spec.md). Sie übernimmt zusätzlich die vollständigen, per SHA-256
gebundenen Hawkeye-Verträge und den Control-Contract aus
the recorded design-phase control contract. Ändert sich einer dieser
Inputs, werden die lokale Readiness-/Authority-Prüfung und PO-Freigabe vor
weiterer Umsetzung erneuert.

Der [Platform-Support-Contract](platform-support-contract.md) ist eine
verbindliche, SHA-256-gebundene Sentinel-Autorität. Er definiert die
capability-spezifischen Support-Claims für Windows, Linux, WSL und macOS,
native same-surface evidence sowie die typisierten negativen Outcomes. Docker
ist derzeit out of scope und ersetzt niemals native Evidenz. Seine gebundene
Windows-Blocker-Scope-Eingabe führt `#33` geschlossen sowie `#34`–`#37` offen;
ein Plattform-Claim wird nur mit aktueller Verify-, Security- und
Critic-Evidenz für denselben Kandidaten zulässig.

Der PO hat am 2026-07-20 zusätzlich das vollständige
[Public-Core-/Private-Consumer-Design](public-private-reconciliation-design.md)
freigegeben. Es ist eine additive Sentinel-Autorität: Die bisher im privaten
Checkout entwickelte portable V3-/Multi-CLI-/Codex-Arbeit wird nicht zuerst
als privates Produkt geschlossen, sondern kontrolliert in die alleinige
öffentliche Produktquelle the Public Core überführt. Das private
`the private consumer repository` wird anschließend ein gebundener Consumer für eigene
versionierbare Templates, ADRs, Policies, Guidelines und Extensions. Rein
lokale Benutzer-, Rechner-, Secret- und Runtime-Daten bleiben außerhalb aller
Git-Repositories in den definierten User-/Git-Common-Dir-Wurzeln.

Die Public-README muss als Teil dieses Scopes die Befehle und Wege für
Installation/Aktivierung, Session-Start, Verify, Block-/Feature-Close,
Update/Migration, Public-Beitrag und private Erweiterung verständlich
dokumentieren. Sie stellt außerdem die belegten Autoren-/Quellenangaben zum
Elephants-&-Goldfish-Modell und zum New SDLC sowie die dritte historische
Acknowledgments-Quelle wieder her.

## Kurzfassung

Sentinel beendet den Schwebezustand nach Batman und Hawkeye: Es prüft jeden
offenen oder laufenden Backlog-Eintrag gegen den tatsächlich gelieferten Code,
schließt bereits erfüllte Arbeit nur mit belastbarer Evidenz und vollendet alle
echten Lücken. Gleichzeitig werden HAW-C und HAW-E ohne Scope-Verlust als ein
zusammenhängendes Feature innerhalb des Epics fertiggestellt: private
regulierte Dokumente, vollständige Review-/Recovery-Kette, gemeinsame
Release-Evidenz, identische Version in privatem und neutral-öffentlichem Kanal
sowie atomarer Produktabschluss.

Das Ergebnis ist kein kosmetischer Backlog-Cleanup. Jeder Status muss wieder
mit Code, registrierten Tests, Verify-Evidenz, State, Ledger und Projektionen
übereinstimmen. Wo Hawkeye oder Batman bereits vorgearbeitet haben, wird diese
Arbeit wiederverwendet und neu belegt; fehlende Abschlussbuchhaltung wird nicht
mit tatsächlicher Fertigstellung verwechselt.

## Verbindliche PO-Ausnahmen dieser Designphase

- PO-Ergänzung vom 2026-07-19: Die Distribution fragt im Setup ausdrücklich
  nach der repositoryweiten Advisor-Exportfreigabe. Ohne Zustimmung bleibt
  Advisory optional und ausgeschaltet. Für dieses Repository ist der Export
  generell freigegeben. Codex-Advisor dürfen Bash zusätzlich zu
  Read/Grep/Glob ausschließlich im ausgewählten `network-open/read-only`-
  Sandbox-Profil nutzen. Fehlende externe Voraussetzungen werden aktiv mit
  kopierbarem Installationsbefehl gemeldet, aber nie automatisch installiert.

- Der ausgewählte Codex-Advisory-Bridge meldete
  `sandbox_selection_unavailable`: Kein Kind wurde gestartet, nichts
  exportiert und kein Receipt erzeugt. Der PO erlaubt Sentinel-Design ohne
  Advisory-Receipt. Ein erfolgreicher Bootstrap-/Advisory-Claim wird daraus
  ausdrücklich nicht abgeleitet.
- Der ausdrücklich freigegebene read-only Sol-Readiness-Export wurde durch die
  maßgebliche Tenant-Policy abgewiesen; es wurde kein Kind gestartet und kein
  unabhängiger Readiness-Receipt erzeugt. Der PO erlaubt den Wechsel in die
  Implementierung auf Basis der lokalen PRD-/Spec-Digest-, Authority-,
  Dokumentations- und Backlog-Prüfung. Daraus wird kein unabhängiger
  Readiness-Claim abgeleitet; die Codex-Readiness-Verdrahtung bleibt
  verpflichtender Scope von `SNT-0`.
- PO-Beschluss vom 2026-07-20: Nach genau einem typisierten Codex-Selected-
  Sandbox-Stopp `no-child` oder `unavailable` darf ein frischer lokaler,
  read-only `consult-advisor` dieselbe einzelne Frage als dauerhaft
  gatefähiger, PO-autorisierter Funktionsäquivalenz-Pass beantworten. Dies gilt
  bis zu einem PO-Widerruf oder bis die Codex-CLI eine funktionierende Selected
  Sandbox liefert. Der Pass behauptet keine attestierte Sandbox-Ausführung,
  OS-Isolation oder Modellidentität; Export, Mutation und Auto-Apply bleiben
  verboten. ADR-0041 und die Spec definieren die genaue Restzusicherung.
- Design läuft in dieser Sitzung auf `gpt-5.6-sol / high`; die spätere
  Implementierung soll auf `gpt-5.6-terra / high` laufen. Beide Abweichungen
  sind begrenzte PO-Ausnahmen und ändern `pipeline.user.v3` nicht.
- Die fehlende saubere Codex-Sol-Advisor-Subagent-Verdrahtung ist Pflichtscope.
  Sie muss vor späteren regulären Advisory-/Readiness-/Critic-Claims grün sein.
- AFK-Modus ist gewünscht, wird aber erst nach PRD-Freigabe und nur für lokale,
  reversible Arbeit innerhalb dieser Spec aktiviert. Er ersetzt keine
  Entscheidung über Lizenz, Release, Remote-Writes oder Abschluss.

## Warum Sentinel ein Epic ist

Der ursprüngliche Nachfolger war als ein Feature für HAW-C und HAW-E geplant.
Der PO hat den Scope anschließend auf alle zum Start `open` oder
`in_progress` geführten Backlog-Items erweitert. Diese 16 Baseline-Einträge
und die am 2026-07-22 explizit aufgenommenen fünf nativen Windows-Blocker
betreffen
mehrere unabhängige Kontroll- und Produktoberflächen: Runner, Sandbox,
Worktrees, Continuity, Governance, Verify, Dokumente, Lizenzierung und Release.
Das ist ein Epic. Der HAW-C/HAW-E-Control-Contract bleibt darin ein einziges,
nicht weiter aufgespaltenes Feature und wird nicht in einen späteren Sprint
verschoben.

## Vollständiger Backlog-Scope

| Backlog-ID | Startstatus | Erste Einordnung | Geschuldeter Abschluss |
| --- | --- | --- | --- |
| `pipeline.afk-assumption-mode` | open | wesentliche Implementierung/Tests vorhanden, aber nicht vollständig registriert oder geschlossen | AC-Audit, fehlende Fälle, Verify-Registrierung, finaler PO-Review, Close |
| `pipeline.canonical-worktree-lifecycle` | open | Worktree-/Cleanup-Code und Tests vorhanden | beide Close-Profile, Recovery und Post-Commit-Cleanliness belegen, Close |
| `pipeline.codex-plugin-validator-host-parity` | open | aktuell reproduzierbar offen | generischen Validator und native Codex-Ingestion versionsgebunden versöhnen |
| `pipeline.codex-sandbox-critic-longterm` | open | schwächere network-open Read-only-Zwischenstufe vorhanden | lokale ACs vollenden; starke Lane nur nach echtem Upstream-/Preflight-/PO-Gate schließen |
| `pipeline.documentation-information-architecture` | open | große Teile durch Hawkeye geliefert | Inventar, Sprach-/Link-/Capability-Parität erneuern; im HAW-E-Batch schließen |
| `pipeline.dual-channel-publication` | open | frühere Kanaltrennung vorhanden, v2-Go-live unvollständig | HAW-E-Zwei-Kanal-Publikation und Fetch-back vollenden |
| `pipeline.execution-model-switchback` | open | Route-Receipts vorhanden, Hauptsession-Drift nicht vollständig belegt | Soll/Ist-Route über Bootstrap/Re-Grounding sichtbar und testbar machen |
| `pipeline.nonblocking-interaction-continuity` | open | Continuity-/Hook-Oberflächen vorhanden | Trajectory-, Compact- und Resume-Kriterien vollständig belegen, Close |
| `pipeline.po-gate-worktree-authority` | open | Mechanismus vorhanden; aktueller Primary-Readback grün | Linked-Worktree-, Kardinalitäts- und Digestfälle im Full Verify belegen, Close |
| `pipeline.push-guard-worktree-target` | in_progress | Korrektur vorhanden | regulären Push aus Ziel-Worktree mit frischer Evidenz und Fetch-back beweisen, Close |
| `pipeline.regulated-document-hooks` | open | öffentliche/private Grundlagen vorhanden | vollständiges HAW-C liefern; im HAW-E-Batch schließen |
| `pipeline.session-keep-awake` | open | Controller/Lifecycle/Tests vorhanden | Plattform-, Ablauf- und Cleanup-Claims auditieren; im HAW-E-Batch schließen |
| `pipeline.source-available-commercial-licensing` | open | echte offene Produktentscheidung | Rechteprüfung, Lizenzwahl, Repo-Umstellung, Human-Legal-Gate, eigener Close |
| `pipeline.stateful-design-contract-template` | open | echte offene Prozessverbesserung | Authority-/Durability-/Recovery-/Enforcement-Checkliste in Vorlage und Elephant-Vertrag |
| `pipeline.t1-governance-path-preflight` | open | Governance-Paketcode teilweise vorhanden | alle Pfad-, ETA- und Tool-Setup-ACs auditieren, ergänzen und schließen |
| `pipeline.verify-gate-scoped-registration` | open | echte offene Ursache für unregistrierte Fokustests | enge additive, PO-/Task-gebundene Registrierung implementieren und nutzen |
| `pipeline.windows-runtime-baseline-containment` | closed | Issue `#33`, physische Windows-Containment-Lücke | kanonische Closure-Evidenz gebunden; kein Restgate |
| `pipeline.windows-directory-durability` | open | Issue `#34`, POSIX-Verzeichnis-fsync-Annahme | Plattform-Assurance ohne schwächeren File-Flush |
| `pipeline.windows-private-state-assurance` | open | Issue `#35`, POSIX-Modi sind keine Windows-DACL-Proof | typisierte Private-State-Assurance, authority fail-closed |
| `pipeline.windows-verify-reproducibility` | open | Issue `#36`, Full Verify nicht nativ Windows-reproduzierbar | Capability-gebundene Fixtures und grüner Standard-Account-Gate |
| `pipeline.windows-trusted-tool-resolution` | open | Issue `#37`, widersprüchliche Tool-Erkennung | gemeinsame vertrauensgebundene Resolver-Authority |

`pipeline.runner-v2-installation-cutover` bleibt geschlossen und wird nur auf
Konsistenz geprüft. `backlog/items/TEMPLATE.md` ist kein Backlog-Item.

## Was wir liefern

### 1. Eine belastbare Backlog-Wahrheit

Sentinel erstellt zuerst eine maschinen- und menschenlesbare
Akzeptanzmatrix. Für jedes der 21 Items werden Originalkriterien, vorhandene
Produktionspfade, Tests, Registrierung im vollständigen Verify, Kandidaten-
Evidenz und noch fehlende Schritte einander zugeordnet. Zulässige
Zwischenurteile sind: nicht begonnen, teilweise umgesetzt, geliefert aber
unbewiesen, verifiziert aber noch nicht transitioniert oder geschlossen.

Ein alter `open`-Status wird nicht automatisch als fehlende Implementierung
interpretiert. Umgekehrt beweist eine vorhandene Datei keine Fertigstellung.
Backlog-Items, Ledger, STATUS und Index werden niemals direkt bearbeitet. Alle
Übergänge laufen über die sanktionierten Writer und akzeptieren bei Recovery
nur die aufgezeichneten Vor- oder Nachbilder.

Der aktuelle strukturelle Validator meldet Item-Dateien, Transition-Ledger,
Closure-Evidence, STATUS und Index als konsistent. Es liegt damit derzeit keine
byte-level Projektionkorruption vor. Aufzuräumen ist die semantische Lücke:
Welche bereits erfüllten Kriterien erhielten nie einen legitimen Übergang, und
welche Einträge sind tatsächlich noch unvollständig?

Wenn frühere Close-Rituale berechtigte Übergänge ausgelassen oder Projektionen
nicht synchronisiert haben, repariert Sentinel zuerst den generischen
Close-/Backlog-Vertrag samt Crash-Recovery. Erst danach werden belegte
Übergänge wiederholt. Historie wird nicht rückwirkend erfunden.

### 2. Codex-Advisory, Validator und Sandbox ohne falsche Claims

Codex erhält die fehlende saubere Produktionsverdrahtung für den bereits
definierten `advisor-consult`: ein frischer Sol-Subagent, genau eine Frage,
kein Chat/Handover/Memory, Read-only, kein Auto-Apply und ein aktueller,
kandidatengebundener Receipt. Auswahl und Ausführung laufen durch den
existierenden selected Sandbox-Bridge; Host-Unverfügbarkeit, falsche
Modellidentität oder fehlende Kind-Evidenz bleiben typisierte Nicht-Erfolge.
Claude/Fable-/Opus-Routing bleibt unverändert.

Der generische Plugin-Validator und die native Codex-Ingestion werden gegen
dasselbe minimale Plugin geprüft. Native `hooks` und bewusst nicht autonom
auslösbare Sicherheits-Skills werden nur akzeptiert, wenn die konkrete
Host-/CLI-Version sie nachweislich lädt; ein Hostwechsel invalidiert den Beleg.

Für den Codex-Critic wird die vorhandene network-open Read-only-Zwischenstufe
ehrlich als schwächerer Claim fertiggestellt. Die starke input-confined,
network-denied Lane wird nicht erfunden: Solange der ursprüngliche
Upstream-/Preflight-/Shadow-/T1-/PO-Vertrag rot ist, bleibt dieses eine Item
offen und blockiert damit den vollständigen Sentinel-Close. Das Epic enthält
die Arbeit vollständig, verspricht aber keinen extern nicht erreichbaren
Erfolg.

### 3. Workflow-Control-Nacharbeiten

- Worktrees liegen kanonisch im Repository; sessioneigene Temporaries werden
  in Full Close und Close-light exakt und sicher geräumt.
- Statusfragen, additive Hinweise und Compact/Resume verlieren nie die
  gespeicherte nächste Aktion.
- PO-Sprache und genau ein PRD gelten repositoryweit über Worktrees; der
  aktuelle Primary-Receipt bleibt die einzige lokale Quelle.
- Push-Guards prüfen den tatsächlichen Ziel-Worktree und dessen exakte Verify-/
  Security-Evidenz.
- Nach Design-/Review-Läufen wird ein Soll/Ist-Modellkonflikt der Hauptsession
  einmal sichtbar gemeldet; Subagentenidentität gilt nie als Sessionbeleg.
- T1-Pakete enthalten alle Manifest-Governance-Pfade; aktive Arbeit nennt eine
  ehrliche Gate-ETA oder `unknown`; gemeinsames Setup trennt Pipeline-Tools von
  projektspezifischen Werkzeugen.
- Stateful-Design-Vorlagen verlangen schon vor Readiness Authority-Issuer,
  Replay, Storage/Atomicity, komplette Crashzustände, Enforcement-Punkt,
  Pre-/Postbilder und Self-Reference-Audit.
- Eine eng begrenzte Verify-Registrierungsautorität darf ausschließlich vorher
  benannte additive Schritte ergänzen; Entfernen, Umordnen oder Schwächen
  bleibt gesperrt.

### 4. AFK-Modus mit nachgelagerter echter Entscheidung

Ohne Aktivierung bleibt das Verhalten unverändert. Eine Aktivierung bindet
Feature, PRD/Spec, State-Revision, erlaubte Pakete, Laufzeit und finales Gate.
Nur lokale reversible Empfehlungen dürfen provisorisch gewählt werden. Jede
Annahme wird vor der nächsten Mutation mit Optionen, Empfehlung, Begründung,
Wirkung und Rückrollpunkt durable erfasst.

Remote-Write, Merge, Tag, Release, Lizenzentscheidung, Secrets, externe oder
irreversible Aktionen, Planfreigabe und finale Abnahme bleiben technisch
gesperrt. Am Schluss disponiert der PO jede Annahme einzeln; eine fehlende
Disposition blockiert Close und Release.

### 5. Source-available-Lizenzierung vor dem ersten Produktrelease

Private und interne Unternehmensnutzung bleiben kostenlos. Direkte
kommerzielle Verwertung der Pipeline oder wesentlicher Ableitungen—Verkauf,
entgeltliche Weitergabe, White-Label, Produktintegration, Hosted/SaaS oder ein
Managed Service, dessen Wert wesentlich aus Agent-Pipeline entsteht—benötigt
eine separate kommerzielle Lizenz.

Empfohlene Freigabegrenzen sind: nichtkommerzielle externe Weitergabe bleibt
mit Notices zulässig; verbundene Unternehmen, Mitarbeiter und Auftragnehmer
dürfen ausschließlich für interne Zwecke des Lizenznehmers arbeiten;
unabhängige Beratung, Schulung und Support bleiben erlaubt, solange nicht die
Pipeline selbst verkauft oder gehostet wird; es gibt keine automatische
spätere Open-Source-Konvertierung. Das Ergebnis wird ehrlich als source
available/fair source bezeichnet.

Eine Rechte-/Provenienzprüfung und ein benannter menschlicher Legal-/
Rechteinhaber-Review sind Pflicht. Agententext ist keine Rechtsberatung.
LICENSE, LICENSE-DOCS, NOTICE, CONTRIBUTING, README, SPDX, Plugin-/Marketplace-
Metadaten und Lizenzprüfungen wechseln konsistent. Historische und
Drittanbieter-Lizenzen werden nicht rückwirkend umgedeutet. Das Licensing-Item
schließt eigenständig und wird danach als harte Evidenz von HAW-E konsumiert.

### 6. HAW-C vollständig statt nur als Grundlage

Sentinel vollendet die private Adapterregistrierung, den begrenzten Linux-/WSL-
Renderer, Policy-/Binding-/Diff-Impact, HMAC-Receipts, Review- und
Nicht-betroffen-Begründungen, Current-Pointer mit CAS/Ablauf/Erneuerung,
Abandonment und jede Crash-Recovery-Stufe.

Private Organisationswerte, Pfade, Vorlagen und Ausgaben bleiben aus Git,
öffentlichen Projektionen und Logs heraus. Der Renderer ist vertrauenswürdiger
privater Code innerhalb der OS-Nutzergrenze, keine behauptete Sandbox. Ohne
nachgewiesene systemd-Cgroup- und Owner-only-Grenze meldet die Funktion ehrlich
`unavailable`. Ein mandatory Dokumentpaar ohne aktuellen Receipt plus Review
oder Begründung blockiert Close mit einem typisierten, wiederaufnehmbaren
Zustand.

### 7. HAW-E als gemeinsamer Go-live

HAW-E bindet vollständige Dokumentevidenz an beide Produktkandidaten, liest
beide Kanäle frisch und plant genau eine SemVer oberhalb der höheren privaten
und öffentlichen Baseline. `0.4.0` ist nur eine Erwartung. VERSION, beide
Plugin-Manifeste, Marketplace-Auflösungen, Dokumentation und annotierte Tags
müssen exakt übereinstimmen.

Private und öffentliche Zustimmung bleiben getrennt; erst eine gemeinsame,
kurzlebige Autorisierung erlaubt privaten Branch-/Worktree-CAS, zwei immutable
Tags und vier guard-gebundene Remote-Effekte. Beide Branch-/Tag-Paare werden
frisch zurückgelesen. Einseitige Veröffentlichung ist kein Erfolg. Nach einer
nicht behebbaren Teilwirkung wird kein Tag bewegt oder gelöscht; nur eine
higher-version Zwei-Kanal-Kompensation ist zulässig.

Das Hawkeye-Result schließt weiterhin genau die drei Produktitems
Dokumentationsarchitektur, regulierte Dokument-Hooks und Keep-awake in einem
Result-gebundenen atomaren Batch. Licensing, AFK und die übrigen Kontrollitems
behalten ihre eigenen nachgewiesenen Übergänge. Der Sentinel-Epic schließt erst,
wenn alle 21 Einträge geschlossen und Ledger/STATUS/Index konsistent sind.

## Umsetzungsschnitt und Reihenfolge

1. PRD-/Spec-/Kandidatenbindung und vollständige Backlog-Akzeptanzmatrix.
2. Scoped Verify Registration und Close-/Backlog-Recovery-Reparatur.
3. Codex Advisor/Validator sowie bereits gelieferte Workflow-Control-Items
   AC-genau verifizieren und schließen.
4. Lizenzierung mit eigenem Human-/Evidence-Gate abschließen.
5. AFK, Stateful-Design und übrige echte Kontrolllücken test-first vollenden.
6. HAW-C-Renderer-/Review-/Recovery-Vertikale abschließen.
7. Keep-awake, Continuity, Worktree, PO-Gate, Push-Guard und Routing in einem
   Integrationscheckpoint erneut prüfen.
8. Capability-/Content-Inventar und öffentliche EN/DE-Dokumentation abgleichen.
9. HAW-E Release-Evidenz, Zwei-Kanal-Publikation, Fetch-back, Result und
   atomaren Drei-Item-Close ausführen.
10. Alle übrigen belegten Backlog-Übergänge, Full Verify, Security Evidence,
    Delta-/Final-Critic, State/Handover/HISTORY und Epic-Close abschließen.

Jeder Produktionsslice erhält zuerst ein eingefrorenes Testpaket und danach
einen gebrieften Terra/High-Goldfish. Der Elephant schreibt keine normale
Produktionsimplementierung. Parallelität ist nur bei getrennten Dateien und
Zustandsautoritäten erlaubt.

## Harte Stops

- Drift in PRD, Spec, geerbten Hawkeye-Inputs oder Kandidat;
- ein Backlog-Close ohne vollständige AC-/Evidence-Zuordnung;
- unregistrierte relevante Tests oder roter Full Verify/Security-Lauf;
- fehlende Legal-/Rechteinhaber-Freigabe oder offene Lizenz-Provenienz;
- private Daten, Secrets, Credentials oder Organisationskoordinaten in
  öffentlichen Artefakten;
- AFK-Aktion außerhalb lokaler Reversibilität oder ohne durable Annahme;
- fehlende Owner-only-, Cgroup-, Sandbox-, Child-/stdio- oder Cleanup-Evidenz;
- stale/ambiguous Channel-Baseline, Versionsdrift, abgelaufene Zustimmung,
  Pointer-/Ref-/Worktree-/Index-Drittzustand oder fehlender Fetch-back;
- einseitige Publikation, bewegter Tag, Teil-Result oder teilweiser
  Backlog-/State-Close;
- unresolved Critic blocker/major oder ein stärkerer Assurance-/Legal-/
  Release-Claim als tatsächlich belegt.

## Nicht-Ziele

- keine direkte Bearbeitung von Backlog-Status, Ledger, STATUS oder Index;
- keine rückwirkend erfundene Fertigstellung aus vorhandenen Dateien;
- keine organisationsspezifischen Dokumente oder privaten Renderer im Public
  Core;
- keine Behauptung, der private Renderer sei sandboxed oder plattformneutral;
- kein generischer Hook-/Shell-Bus und kein `danger-full-access`;
- keine stille Änderung an Claude/Fable-/Opus-Routing oder `pipeline.user.v3`;
- kein automatischer Modellwechsel ohne beobachtbare Host-Autorität;
- keine Rechtsberatung oder selbst erteilte Lizenz-/Rechtefreigabe;
- keine Ein-Kanal-Version, kein Tag-Move, kein generischer Push und kein
  Release aus AFK-Annahmen;
- kein Schließen des starken Codex-Isolationsitems, solange dessen eigene
  Upstream-/Preflight-/Shadow-/T1-/PO-Kriterien nicht erfüllt sind.

## Definition of Done

Sentinel ist fertig, wenn alle 16 zum Start offenen/laufenden Backlog-Items
`closed` sind, ihre Originalkriterien und neue Sentinel-Kriterien durch
kandidatgebundene Evidenz erfüllt werden und Ledger, STATUS sowie Index exakt
übereinstimmen. HAW-C muss seine vollständige private Vertikale liefern; HAW-E
muss beide Kanäle unter derselben frisch ermittelten Version mit Branch-/Tag-
Fetch-back schließen. Licensing und AFK benötigen ihre getrennten menschlichen
Dispositionen. Full Verify, Security Evidence, Capability-Inventar,
zweisprachige Dokumentation und ein frischer High-Risk-Critic müssen die
finalen Kandidaten binden. Ein extern blockiertes Item hält den Epic ehrlich
offen; es wird nicht aus dem Scope entfernt und nicht per Ausnahme grün genannt.

## Entscheidungspunkte

Eine PRD-Freigabe ohne Änderung wählt jeweils A.

1. **Sprintform**
   - **1A (Empfehlung):** Sentinel als Epic; HAW-C/HAW-E bleiben ein internes,
     ungeteiltes Feature.
   - **1B:** Feature beibehalten; wäre mit 16 heterogenen Items methodisch zu
     klein und benötigt eine ausdrückliche Profilabweichung.
2. **Backlog-Bereinigung**
   - **2A (Empfehlung):** AC-/Evidence-Audit und ausschließlich sanktionierte
     Übergänge; kein Status aus Dateiexistenz ableiten.
   - **2B:** offene Stati pauschal schließen; verworfen, da nicht auditierbar.
3. **Codex-Advisory**
   - **3A (Empfehlung):** Sol-Consult als selected read-only Subagent sauber
     verdrahten; heutige Design-Ausnahme bleibt einmalig.
   - **3B:** Advisor dauerhaft optional machen; würde V3 Feature/Epic schwächen.
4. **AFK**
   - **4A (Empfehlung):** nur lokale reversible Annahmen mit finaler
     Einzel-Disposition.
   - **4B:** auch externe Aktionen erlauben; verworfen wegen fehlender
     aktueller menschlicher Autorität.
5. **Lizenzgrenzen**
   - **5A (Empfehlung):** kostenlose interne und nichtkommerzielle Nutzung/
     Weitergabe; kommerzielle Produkt-/Hosted-Verwertung lizenzpflichtig;
     Affiliates/Contractors intern erlaubt; Beratung ohne Produktverkauf
     erlaubt; keine automatische Konvertierung.
   - **5B:** abweichende Grenzfälle einzeln neu entscheiden und PRD/Spec vor
     Implementierung aktualisieren.
6. **Codex-Critic-Isolation**
   - **6A (Empfehlung):** lokal mögliche Zwischenstufe vollständig liefern,
     starken Close aber nur bei erfülltem Upstream-/Gate-Vertrag.
   - **6B:** schwächere Lane als starke Isolation umdeuten; unzulässig.
7. **Releaseversion**
   - **7A (Empfehlung):** nächste SemVer oberhalb beider frisch gelesener
     Baselines; heute nur erwartbar `0.4.0`.
   - **7B:** Version jetzt festschreiben; verworfen, da Baseline veralten kann.
8. **Abschlussgranularität**
   - **8A (Empfehlung):** Licensing/AFK/Kontrollitems mit eigener Evidenz;
     exakter Drei-Item-HAW-E-Batch; Epic-Close erst nach allen 21 Items.
   - **8B:** ein pauschaler 16-Item-Batch; verworfen, weil er unterschiedliche
     Authorities und echte Lücken verschleiern würde.
