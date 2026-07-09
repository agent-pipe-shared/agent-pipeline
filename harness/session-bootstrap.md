# Session-Bootstrap-Protokoll

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** Verbindliches Harness-Protokoll. Erfüllt die Missions-Pflicht „Bootstrap-Doku" — den Plugin-Stand (SHA/Version) anzeigen, ihn gegen den Remote-Stand prüfen, Offline-Verhalten und Refresh-Ritual definieren. Gilt für **jede neue Session in jedem angebundenen Projekt** (<PROJECT_A>, <PROJECT_B>, <PROJECT_C>, Pipeline-Repo selbst), auf beiden Rechnern, unabhängig von lokalen Pfaden. Die ausführbare Form entsteht in Phase 3 als Skill (agent-facing, englisch — → ADR-0011 Sprache in docs/adr/); dieses Dokument ist die menschenlesbare Spezifikation und bei Abweichungen die Referenz.

---

## 1. Zweck

Jede neue Session muss drei Dinge sicherstellen, **bevor** sie arbeitet:

1. **Regelwerk geladen und aktuell:** Das Plugin `pipeline-core` (Skills, Agents, Hook-Guardrails) ist installiert, und sein Stand entspricht dem Remote-Stand des zentralen Repos.
2. **Projekt-Kontext geladen:** Projekt-Kalibrierung (die dünne projektspezifische Schicht) und Handover-Stand sind gelesen.
3. **Prüfbarer Vollzug:** Eine formatierte Selbstbestätigung macht den Bootstrap auditierbar — fehlt die Zeile, hat kein Bootstrap stattgefunden.

**Warum ein eigenes Protokoll:** Der Plugin-Cache ist eine **Kopie pro User pro Maschine**. Ein Push ins zentrale Repo propagiert **nicht** automatisch — Auto-Update ist für eigene Marketplaces per Default aus, und in der SHA-Phase zählt jeder Commit als neue Version, die erst ein manueller Refresh abholt. Auf zwei Rechnern entsteht so **Cache-Drift**: Rechner B arbeitet mit alten Guardrails, ohne es zu merken — die alte Copy-Paste-Drift in neuer Form. Der Bootstrap-Check macht diese Drift bei jedem Sessionstart sichtbar, statt auf Disziplin zu hoffen.

---

## 2. Mechanismus-Entscheid: drei Schichten

Kompaktfassung; vollständige Abwägung mit allen Kriterien → **ADR-0010** in docs/adr/.

| Schicht | Träger | Liefert | Warum dieser Träger |
|---|---|---|---|
| **Verhalten** | Plugin `pipeline-core` aus dem Marketplace-Repo `agent-pipeline` | Skills, Agents, Hooks (harte Guardrails) | Einziger Mechanismus mit Versionierung, Pinning **und** Hook-Verteilung; pfadunabhängig via User-Cache |
| **Bindung** | Committete `.claude/settings.json` je Projekt (`extraKnownMarketplaces` + `enabledPlugins`) | Deklaration „dieses Projekt nutzt diese Standards" | Jedes Projekt-Repo ist self-describing: frischer Klon auf Rechner 2 (oder CI/Cloud) trägt die Bindung mit; Install-Prompt beim Bestätigen des Ordners als vertrauenswürdig |
| **Stand** | Handover-Datei je Projekt (kanonischer Name/Ort → docs/operating-model.md); im Pipeline-Repo: docs/state.md | Was gerade gilt, was offen ist, was zuletzt entschieden wurde | EINE versionierte Quelle statt dreifach handgepflegtem Staffelstab |

Versionierung: zunächst **SHA-basiert** (jeder Commit propagiert bei Refresh), SemVer + Tags ab Stabilitätsphase.

**Bewertete Alternativen** (je 1 Satz Warum-nicht-allein; Details → ADR-0010 in docs/adr/):

- **Globales `~/.claude` allein:** wirkt auf alle Projekte gleich ohne Pro-Projekt-Bindung, und die Projekte sind nicht self-contained — ein frischer Klon (Rechner 2, CI) trägt die Standards nicht mit.
- **`@`-Imports allein:** verteilen nur Instruktionstext, keine Hooks/Agents — harte Guardrails blieben unerzwungen, denn CLAUDE.md ist offiziell „context, not enforced configuration".
- **Eingecheckte `.claude/`-Kopien je Projekt:** exakt das belegte Anti-Pattern — mehrere guard-git-Inkarnationen können nachweislich divergieren, ohne dass eine davon Superset der anderen ist.
- **SessionStart-Hook allein:** kann Kontext injizieren, aber der Hook selbst muss erst einmal ins Projekt kommen — Hooks verteilen sich nur über User-Settings oder Plugins, also Henne-Ei ohne die Plugin-Schicht.

Der SessionStart-Hook ist deshalb nicht der Verteilmechanismus, sondern ein **Baustein der Durchsetzung** dieses Protokolls (siehe §3, Verankerung).

---

## 3. Bootstrap-Ablauf

Als Skill implementiert (Phase 3): **`/pipeline-core:pipeline-start`** (kanonischer Name; die Auflösung der früheren Arbeitsnamen ist im Skill-Kopf dokumentiert — `plugins/pipeline-core/skills/pipeline-start/SKILL.md`). Wo der Skill nicht installiert ist, gilt der Ablauf als manuelle Checkliste (`templates/prompts/session-bootstrap-check.md`).

**Verankerung (wie das Protokoll sich selbst durchsetzt):**

1. Ein **SessionStart-Hook** aus dem Plugin fordert die Ausführung des Bootstrap-Skills an — deterministisch, sobald das Plugin geladen ist (Muster „Kontext injizieren").
2. **Eine Zeile in der Projekt-CLAUDE.md** („Führe zuerst `/pipeline-core:pipeline-start` aus") als advisory Fallback. Schlägt die Skill-Invokation fehl („unknown skill"), ist genau das der Nachweis von Fall **F1** (Regelwerk fehlt) — der Fallback detektiert also die Abwesenheit der Hauptschicht.
3. Die **Bestätigungszeile** (Schritt 6) macht den Vollzug für den PO und für Hooks prüfbar.

### Schritt 1 — Plugin-Präsenz + geladenen Stand ermitteln

- **Gebot:** Stelle fest, ob `pipeline-core` installiert und geladen ist, und ermittle den geladenen Stand: in der SHA-Phase den Commit-SHA, ab SemVer-Phase die Version (Auflösungsreihenfolge: `plugin.json`-Version → Marketplace-Eintrag → Commit-SHA).
- **Warum:** Ohne Plugin keine Hook-Guardrails — jede schreibende Arbeit liefe ungeschützt (dieselbe Lektion wie die acceptEdits-Vorbedingung).
- **Prüfweise:** Plugin-Skills sind aufrufbar (der Bootstrap-Skill selbst antwortet = Präsenz belegt); der Stand ist als konkreter SHA/Versionsstring benennbar, nicht als „irgendwas ist installiert".
- **VERIFIZIERT (Haupt-PC, 2026-07-04; Laptop-Gegenprobe noch offen):** Maschinenlesbare Quelle für den installierten SHA ist `~/.claude/plugins/installed_plugins.json` → Eintrag `pipeline-core@agent-pipeline`: Feld `gitCommitSha` (voller SHA), dazu `version` (12-stelliges SHA-Präfix), `installPath` (der Cache-Ordner ist nach dem SHA-Präfix benannt: `cache/agent-pipeline/pipeline-core/<sha12>/`), `scope` + `projectPath`. Sekundärquellen: der Cache-Verzeichnisname selbst; der Marketplace-Klon (`git -C ~/.claude/plugins/marketplaces/agent-pipeline rev-parse HEAD`). **Achtung Semantik:** Der Marketplace-Klon kann dem installierten Cache vorauslaufen (nach `marketplace update` ohne `plugin update`) — für den GELADENEN Stand ist `installed_plugins.json` maßgeblich; die Klon-vs-installed-Differenz ist genau die Staleness-Zwischenstufe.

### Schritt 1b — Modell/Effort setzen und verifizieren (Elephant-Pflicht)

- **Gebot (Profilwahl; DRITTE OPTION `speed` NEU):** VOR der Modell-/Effort-Setzung stellt der Bootstrap die harte Profil-Frage (AskUserQuestion-UI, 3 Optionen + Freitext = PO-Ausnahme):

  > Profilwahl (hart, AskUserQuestion, 3 Optionen + Freitext = PO-Ausnahme): „Session-Profil für dieses Thema — Advisor (Cost/Quality) [advisor] (Design-Tier-Modell durchgehend ab Sessionbeginn + angehängtem Advisor-Modell — Standard, solange das Advisor-Modell außerhalb des eigenen Plan-Kontingents abgerechnet wird) oder Design-First (Cost+/Quality+) [design-first] (phasenbewusst: Design für dieses Thema BEREITS freigegeben? → direkt Ausführungsphase, Design-Tier-Modell bei Effort `max` ab Sessionbeginn, Design-Tier-Modell sonst nur für T1-Critics/Readiness-Subagenten; sonst Design-Tier-Modell bei Effort `xhigh` bis zum PRD-Freigabe-Gate, dann GENAU EIN Wechsel auf Effort `max` — Kostenfolge: ein Modell außerhalb des eigenen Plan-Kontingents kann einen spürbaren Anteil einer Ausführungssession als Overage kosten; das eigene Abrechnungsmodell vorher prüfen, nicht annehmen) oder Speed (Mini-Feature/Hotfix) [speed] (Implement-Tier-Modell + ein ab Sessionbeginn aktiver Design-Tier-Advisor — exakte Modell-/Effort-/Advisor-Kommandos gemäß `policies/model-policy.md` MP-28; leichter Bootstrap: nur Regelwerk-SHA + Kalibrierungs-Existenz + verify-Verfügbarkeit + operativer Handover-Kopf, EINE Bestätigungszeile statt drei, keine Profil-Zeremonie; Geltungsbereich ~≤5 Dateien, KEINE Guardrail-/Kanon-Dateien, keine neuen Abhängigkeiten — Grenze gerissen ⇒ Pflicht-Eskalation ins Vollprofil; Guard-Hooks bleiben immer aktiv; Details → §6.5)?"

  Der PO entscheidet je Thema des ersten Prompts. Freitext-Antwort = PO-Ausnahme-Pfad (z. B. eine reine Design-Tier-Sondersession — bleibt PO-designierbar, kein vierter Button). Je nach gewähltem Profil werden die verbatim vorzulegenden Kommandos präsentiert (gezeigt mit dem mitgelieferten Default-Preset für das Design-Tier, `opus` — die tatsächlich konfigurierten Namen stammen aus `pipeline.user.yaml` → `models.*`):

  > Profil advisor (ab Sessionbeginn):
  > /model opus
  > /effort max
  > /advisor \<advisor model\>
  >
  > Profil design-first, Design bereits freigegeben (phasenbewusst) — ab Sessionbeginn:
  > /model opus
  > /effort max
  >
  > Profil design-first, Design noch nicht freigegeben (Wechsel am PRD-Freigabe-Gate):
  > /model opus
  > /effort max
  >
  > Advisor-Hygiene (design-first, falls Advisor konfiguriert):
  > /advisor off
  >
  > Profil speed (ab Sessionbeginn, Details → §6.5):
  > Modell/Effort/Advisor gemäß `policies/model-policy.md` (MP-28) — fixe Zuordnung, keine weitere Profil-Zeremonie.

  **Advisor-Hygiene (neue Reihenfolge):** Läuft im Profil `design-first` bereits ein Advisor (Rest eines vorherigen `advisor`-Profils — ein Advisor-Modell-User-Setting persistiert je Maschine), prüft der Bootstrap in dieser Reihenfolge: (1) Frage nach parallelen Advisor-Sessions anderer Projekte auf dieser Maschine; (2) bevorzuge den projekt-lokalen Off-Schalter `"advisorModel": ""` in `.claude/settings.local.json` (der Live-Settings-Validator lehnt `null` ab, obwohl die Doku es nennt; `$comment`-Schlüssel sind in `settings.local.json` ungültig); (3) `/advisor off` NUR, wenn keine parallele Session betroffen ist; (4) **Divergenz = Pflichtfrage (PO-Bedingung „man entscheidet immer"):** weicht der TATSÄCHLICHE Advisor-Zustand vom beabsichtigten Zustand des gewählten Profils ab (z. B. maschinen-vererbter Advisor in einer design-first-Session), legt der Bootstrap die Auflösung als AskUserQuestion vor (Advisor behalten / projekt-lokal aus / `/advisor off`) — stille Vererbung ist ein Bootstrap-Defekt, Informieren ohne Fragen erfüllt die Pflicht NICHT.
- **Gebot (Elephant, profilgebunden):** Setze und **verifiziere** Modell/Effort gemäß dem in Schritt 1b gewählten Profil (`policies/model-policy.md` MP-01/MP-17): Profil `design-first` → **phasenbewusst:** ist das Design für dieses Thema BEREITS freigegeben (Regelfall einer Folge-Ausführungssession nach EL-25-Schnitt), startet die Session DIREKT in der Ausführungsphase, `/model opus` + `/effort max` ab Sessionbeginn, das Design-Tier-Modell sonst nur für T1-Critics/Readiness-Subagenten; sonst `/model opus` + `/effort xhigh` bis zum PRD-Freigabe-Gate, danach GENAU EINMAL `/effort max` (EL-24, sanktionierte Ausnahme MP-17/MP-18); Profil `advisor` → bereits ab Sessionbeginn `/model opus` + `/effort max` + Advisor aktiviert (MP-26 — Standard, solange das Advisor-Modell außerhalb des Plan-Kontingents abgerechnet wird); Profil `speed` (NEU) → Modell/Effort/Advisor gemäß `policies/model-policy.md` (MP-28) bereits ab Sessionbeginn — fixe Zuordnung, kein Phasenwechsel, keine Advisor-Hygiene-Ablaufprüfung nötig. Effort ist **session-only** und muss bei jedem Sessionstart neu gesetzt werden. **Hinweispflicht:** `xhigh` bleibt der Design-Phase-Standard; `max` wird sonst NICHT generisch für Guardrail-/Architektur-/Refactoring-Sessions empfohlen — `max` gilt nur bei Modell-Fallback-Betrieb, bei Implement-/Mechanic-Tier-Dispatches, für vom PO benannte Sondertasks (z. B. initiale Sessions ganz neuer Themen; bei MP-08-Indikation weiterhin alternativ der Ultracode-Task-Opt-in), oder bei geplantem Ausführungsphasen-Betrieb auf dem Design-Tier-Modell (Profile `design-first`/`advisor`). Hinweispflicht heißt jetzt: die Option benennen, wenn der PO selbst einen solchen Sondertask ausweist — kein proaktives Anpreisen mehr. Der PO entscheidet.
- **Gebot:** Bestätige, dass `CLAUDE_CODE_SUBAGENT_MODEL` **NICHT** gesetzt ist (MP-04) — die Env-Var würde das Frontmatter aller Subagents überschreiben und die Modell-Matrix still aushebeln.
- **Rollen:** Pflicht für den Elephant (§6.1). Goldfish/Critic beziehen Modell/Effort aus Agent-Frontmatter bzw. Dispatch (MP-02/MP-07) — für sie entfällt der Schritt.
- **Modell-Identitäts-Härtung:** Die aktive Modell-Identität wird aus BEOBACHTETER Evidenz bestätigt (`/model`-Ausgabe oder explizite PO-Bestätigung), nie angenommen — insbesondere in den Turns unmittelbar nach einem Credit-/Limit-Ereignis (Risiko eines stillen Fallbacks auf ein anderes Modell).
- **Prüfweise (profilgebunden):** Profil `design-first`: vor dem PRD-Gate bestätigt die Zusatzzeile das Design-Tier-Modell bei `xhigh`; nach dem Gate bei `max` plus Identitätsnachweis (`/model`-Ausgabe). Profil `advisor`: die Zusatzzeile bestätigt von Sessionbeginn an das Design-Tier-Modell bei `max` UND einen angehängten Advisor. Die Zusatzzeile der Elephant-Bestätigung (§6.1) nennt Modell/Effort/Profil/Advisor (erweitertes Format, s. Schritt 6); Abweichungen vom Rollen-Default sind begründungspflichtig gegen `policies/model-policy.md`.
- **Gebot (Advisor-Bereitschaftsprobe, Härtung zu MP-26g — nach PO-Befund: Sessions ziehen den Workaround nicht von selbst, sondern „wollen es weglassen oder auf das Hauptmodell wechseln"):** Im Profil `advisor` prüft der Elephant NACH Advisor-Aktivierung einmalig aktiv, ob der Advisor tatsächlich antwortet (ein trivialer Advisor-Consult zu Sessionbeginn — eine einzige, billige Verifikationsfrage genügt). Meldet dieser erste Kontakt `unavailable`/einen Fehler, gilt MP-26g in genau dieser Reihenfolge: (a) SOFORT-Meldung an den PO binnen desselben Turns; (b) der Skill `pipeline-core:advisor-consult` wird für den Rest der Session als Advisory-Ersatzkanal aufgesetzt — der Skill ist der PFLICHT-Primärpfad, kein optionaler Vorschlag; (c) zusätzlich (nicht alternativ) bietet der Elephant dem PO einen Umschalt-Block auf ein alternatives Advisor-Modell an. Kein stilles Weiterlaufen ohne Advisor-Kanal, kein einseitiger Hauptmodell-Wechsel als Ersatzhandlung.
  - **Prüfweise:** Die Session-Notizen/das Handover nennen das Probe-Ergebnis (analog zur bestehenden Post-Compact-Advisor-Check-Konvention oben, keine zusätzliche literal-geprüfte Zeile in Schritt 6) — ein im Profil `advisor` übersprungener Probe-Schritt ist ein Bootstrap-Mangel.
  - **Live-Validierungs-Vorbehalt:** Die Probe selbst ist bislang nur spezifiziert, nicht live gegen einen echten Advisor-Ausfall verifiziert (Follow-up — braucht einen echten Ausfall zur Beobachtung, kein Blocker für diese Spezifikation).
- **Gebot (Effort-Introspektions-Grenze):** Der Session-Effort ist von innen NICHT maschinen-introspektierbar — anders als die Modell-Hälfte, die `/model`-Ausgabe direkt bestätigt (Modell-Identitäts-Härtung oben). Die einzige verlässliche Quelle ist dieser Bootstrap-Schritt selbst: einmaliges Setzen gemäß dem gewählten Profil + die explizite (ggf. PO-bestätigte) Zusatzzeile — kein Introspektions-Tool, das es nicht gibt. Diese Lücke blockiert read-only-Arbeit NICHT: sie darf parallel zu einer noch ausstehenden PO-Bestätigung beginnen (praktizierter, hiermit kodifizierter Umgang).

### Schritt 1c — Spend-/Usage-Check (Elephant; optional-empfohlen)

- **Gebot (soll):** Prüfe zu Sessionbeginn die Budget-Lage: gesetzte `/usage-credits`-/Workspace-Limits, bekannter Wochenlimit-Druck (MP-16). Ein gesetztes oder nahes Limit wird **einmalig in der Bestätigungs-Ausgabe dokumentiert**; bei akutem Budget-Druck wird die Konsequenz benannt (Delegation-first: Ausführung auf dem Implement-/Mechanic-Tier, Design-Tier nur Judgment — MP-22). **Zusatzpflicht bei Modell-Fallback:** Steht bei Sessionbeginn ein Modell-Fallback (insb. auf ein anderes konfiguriertes Modell) im Raum, MUSS die Limit-Behauptung gegen aktuelle `/usage`-Werte verifiziert werden — Limit-Prozentsatz UND Reset-Zeitpunkt werden dem PO konkret benannt; eine Fallback-Entscheidung auf Basis unverifizierter/veralteter Limit-Information ist ein Verstoß. Für die Mechanik „/usage ist ein User-Kommando → einmalig nachfragen" gilt der Satz in der Prüfweise unten (dort bereits enthalten, nicht duplizieren; ebenso in SKILL.md Schritt 1c). Der Switch/Schnitt selbst bleibt des PO situativer Entscheid — KEINE kodifizierte Schnitt-Automatik am Reset (MP-17: Mid-Session-Modellwechsel invalidiert den warmen Cache).
- **Warum:** Zwei belegte Vorfälle aus der eigenen Entwicklung dieser Pipeline: ein Spend-Limit-Abbruch mitten in einem laufenden Arbeitslauf (per Resume fortgesetzt) und spürbarer Wochenlimit-Druck in einer späteren Phase. Budget-Überraschungen mitten in der Arbeit kosten Läufe und Qualität; der Check gehört an den Sessionstart, nicht ans Taskende.
- **Prüfweise (Soll-Regel):** Das Weglassen des Schritts ist zulässig (optional-empfohlen). WIRD er ausgeführt, enthält die Bestätigungs-Ausgabe den Limit-Vermerk oder explizit „kein Limit gesetzt/bekannt" — ein falscher oder erfundener Vermerk ist ein Verstoß, ein fehlender nicht. `/usage` ist ein User-Kommando: Kann die Session den Wert nicht selbst einsehen, fragt sie einmalig nach, statt zu raten (dreiwertige Ehrlichkeit). **In einer Modell-Fallback-Session nennt die 1c-Ausgabe BEIDE Werte** (Limit-% + Reset-Zeitpunkt); ein Fallback-Vermerk ohne beide Werte gilt als Schritt nicht ausgeführt. Beleg aus der eigenen Entwicklung: eine mehrstündige Fallback-Session gegen eine ungeprüfte „Hauptmodell gesperrt"-Annahme, während das eigentliche Limit nach einem zwischenzeitlichen Reset längst wieder Spielraum hatte.

### Schritt 1d — Rollen-Verbote (Elephant)

- **Gebot (Elephant):** Bestätige vor Arbeitsbeginn die Rollen-Verbote des Elephant als kompakte, direkt eingebettete Liste (KEIN Zusatz-Dateilesen zur Laufzeit — Token-Ökonomie):
  - **EL-01** — kein Produktionscode; einzige Ausnahme: Stufe-0-Fast-Path gemäß `docs/operating-model.md` §3.3; weitere Ausnahmen nur durch den PO.
  - **EL-02** — kein Schritt-für-Schritt-Mikromanagement; Delegation erfolgt einmalig, über das 6-Felder-Briefing.
  - **EL-03** — Urteilsvermögen bleibt auf der richtigen Ebene (nie das PO-Urteil übernehmen, nie nach unten abschieben, nie das Gate outsourcen).
  - **EL-04** — keine stillen Grundsatzentscheidungen (Register + ADR, sonst existiert die Entscheidung nicht).
  - **EL-16** — Delegate-first in der Ausführungsphase: JEDE Implementierung läuft als gebriefter Implement-/Mechanic-Tier-Goldfish-Dispatch; „klein/verzahnt" ist KEINE Ausnahme — verzahnte Kleinfeatures werden zu EINEM Briefing gebündelt; Design-Phase-Denken bleibt Elephant-Arbeit.
  - **EL-18** — ein Repo, ein Elephant; repo-übergreifende Bedarfe laufen über den Transfer-Pfad.
  - **EL-19** — PO-Gate: PRD nach Readiness-Check PROAKTIV lesbar vorlegen (kein bloßer Datei-Pfad; Remote-Sessions: ans Gerät senden/rendern) und explizit auf das Wort „freigegeben" warten — keine Implementierung vor dessen Eintreffen.
- **Warum:** Genau diese Verbote wurden in einer <PROJECT_B>-Session real verletzt — weder Bootstrap noch Close noch Critic fingen es auf, weil der Bootstrap die Rollen-Verbote nie lud. Die eingebettete Liste macht sie am Sessionstart unübergehbar sichtbar, statt auf Erinnerung zu hoffen.
- **Rollen:** Pflicht für den Elephant. Goldfish/Critic erhalten ihre Verbote über das Dispatch-Briefing (Feld 4 „Verbote" bzw. den jeweiligen Rollenvertrag) — für sie entfällt dieser Schritt als eigener Bootstrap-Akt.
- **Prüfweise:** Die dritte Bestätigungszeile (→ §6.1) nennt die Rollen-Verbote wörtlich; ihr Fehlen zeigt, dass Schritt 1d nicht ausgeführt wurde.

Dieser Schritt endet in einer **dritten verbindlichen Bestätigungszeile** (Deutsch, wörtlich, direkt unter der Modell/Effort-Zeile gedruckt; literal geprüft wie Zeile 1 — Format → §6.1):

> „Rollen-Verbote geladen: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — Implementierung nur per Goldfish-Dispatch (Stufe-0 per OM §3.3; weitere Ausnahmen nur durch den PO); PRD-Gate: lesbar vorlegen + auf ‚freigegeben' warten"

### Schritt 2 — Staleness-Check gegen den Marketplace-Remote

- **Gebot:** Vergleiche den installierten Stand mit dem Remote-HEAD des Marketplace-Repos, z. B. `git ls-remote <marketplace-url> HEAD`. Die URL steht in der committeten `.claude/settings.json` des Projekts (`extraKnownMarketplaces`-Eintrag) — der Skill kann sie von dort ableiten, kein Hardcoding.
- **Hinweis (Mechanismus, nur bei STALE-Warnung des SessionStart-Hooks):** Meldet der SessionStart-Hook des Plugins in DIESER Session eine STALE-Warnung, die installierten SHA und Remote-SHA namentlich nennt, darf Schritt 2 dieses Ergebnis als gleichwertige Evidenz übernehmen statt `ls-remote` selbst erneut auszuführen. Die reale Hook-Ausgabe kennt sonst nur eine konstante Fresh-Pfad-Bootstrap-Zeile ohne SHAs — sie fällt identisch aus, ob die SHAs übereinstimmen oder der Hook mangels Auflösbarkeit fail-open ausgelöst hat, und taugt deshalb NICHT als Substitutionsnachweis. Liegt nur diese konstante Zeile vor oder fehlt jede Hook-Ausgabe, gilt Schritt 2 unverändert per eigenem `ls-remote`.
- **Warum:** Drittanbieter-Marketplaces auto-updaten nicht; ohne diesen Check ersetzt Zwei-Rechner-Cache-Drift die alte Copy-Paste-Drift.
- **Prüfweise:** SHA-Gleichheit = aktuell. Abweichung = stale → Fall **F2**. Remote nicht erreichbar → Fall **F3**. Der Check braucht Netz + Credentials fürs private Repo (siehe §5).

### Schritt 3 — Projekt-Kalibrierungsdatei lesen (Existenz-Check zuerst!)

- **Gebot:** Prüfe zuerst, dass die Kalibrierungsdatei **existiert** (Arbeitsname einheitlich: `.claude/pipeline.json`), dann lies sie vollständig. Erwartetes Pflichtfeld-Minimum (Feldskizze → docs/operating-model.md §8): verify-Kommando(s), Autonomie-Stufe, Branch-Modell, Worktree-Regel, Stakes-Einstufung, Projekt-Constraints.
- **Gebot (Denies):** Projekt-**Denies** leben NICHT in der Kalibrierungsdatei, sondern in der committeten `.claude/settings.json` bzw. der Guard-Config des git-guard — dieser Schritt prüft die Denies **dort** (Existenz der committeten Permission-/Guard-Einträge).
- **Warum:** Die zentralen Skills sind parametrisiert und lesen diese Datei — ohne sie laufen Rituale mit falschen Defaults, im schlimmsten Fall mit den Guardrails des falschen Projekts.
- **Prüfweise:** Datei existiert und enthält die Pflichtfelder; fehlt sie oder ist sie unvollständig → Fall **F4**.
- **Entschieden:** Mechanismus + Feldskizze → docs/operating-model.md §8; **Schema-Format:** JSON (`.claude/pipeline.json`, mit der Plugin-Lieferung).

### Schritt 4 — Handover-/State-Datei lesen

- **Gebot:** Lies die Handover-Datei des Projekts vollständig (im Pipeline-Repo: docs/state.md). Sie ist die **einzige maßgebliche Stand-Quelle**; Memory ist nur Spiegel.
- **Warum:** Der handgepflegte Dreifach-Staffelstab hat nachweislich gelogen; die Pipeline ersetzt ihn durch eine Quelle — dann muss jede Session genau diese lesen.
- **Prüfweise:** Das Datum der letzten Aktualisierung ist extrahierbar (es geht in die Bestätigungszeile). **Drift-Schwellwert (Default):** Warnung liegt vor, wenn der letzte Commit des Projekt-Repos NEUER ist als der Handover-Stand UND das Delta seither mindestens einen Nicht-Doku-Commit enthält (reine Doku-Deltas lösen keine Warnung aus); ein Projekt kann einen abweichenden Schwellwert per `$driftThreshold`-Kommentarfeld in `.claude/pipeline.json` dokumentieren (Default gilt, wenn das Feld fehlt).

### Schritt 5 — Projekt-Gates verfügbar?

- **Gebot:** Prüfe, dass das **eine** verify-Skript des Projekts existiert und grundsätzlich lauffähig ist (Existenz + Aufrufbarkeit, z. B. Trockenlauf/Hilfe-Aufruf — kein vollständiger Gate-Lauf beim Bootstrap).
- **Warum:** Ohne lauffähiges verify ist die Evidenzpflicht nicht erfüllbar — ein Goldfish, der später nicht abgeben kann, ist verschwendetes Token-Budget; das soll am Sessionstart auffallen, nicht am Taskende.
- **Prüfweise:** Pfad/Kommando stammt aus der Kalibrierungsdatei (Schritt 3); Existenz-Check bestanden. Fehlt das Skript → wie F4 behandeln (STOP für schreibende Arbeit, Anlage anbieten).

### Schritt 6 — Selbstbestätigung ausgeben (Format verbindlich)

- **Gebot:** Gib exakt diese Zeile aus:

  > **„Bootstrap-Check bestanden: Regelwerk \<version/SHA\> geladen · Projekt \<name\> · Kalibrierung \<datei\> · Stand \<handover-datum\> · Rolle \<Elephant|Goldfish|Critic\>"**

  Definierte Zusätze (nur diese, jeweils angehängt mit „·"):
  - bei F3: „· Staleness ungeprüft (offline, Cache-Stand)"
  - bei akzeptiertem F2: „· HINWEIS: Regelwerk stale (\<n\> Commits hinter Remote)"
  - bei Kurz-Bootstrap (same-day, §6.4): „· Staleness same-day gecacht (voller Check \<HH:MM\>)"
  - bei Speed-Bootstrap (§6.5): „· Profil speed — Leicht-Bootstrap (Details → §6.5)"; die Zusatzzeilen für Modell/Effort (§6.1) und Rollen-Verbote (§6.1) entfallen dabei — sie gelten inhaltlich unverändert weiter, werden im Speed-Pfad nur nicht als eigene Zeilen wiederholt (EINE Bestätigungszeile statt drei).
  - bei F4 (Kalibrierung und/oder Handover fehlt — der ERWARTETE Erstzustand in noch nicht migrierten Projekten): das betroffene Feld trägt statt eines Platzhalters den Wert „FEHLT (F4)" — also „Kalibrierung FEHLT (F4)" bzw. „Stand FEHLT (F4)" —, PLUS Pflicht-Suffix „· F4: nur Read-only-Analyse bis Kalibrierung/Handover angelegt".
  - Rollen-Varianten für das Feld „Stand" → §6.
- **Warum:** Die Zeile ist der auditierbare Beweis des Vollzugs — der PO (oder ein Hook) kann jede Session daran prüfen, ohne den Verlauf zu lesen.
- **Verbot:** Die Zeile ohne tatsächlich durchgeführte Schritte 1–5 ausgeben. Das wäre exakt der dokumentierte Haupt-Failure-Mode „fertig gemeldet, aber nicht geprüft" — und ein Critic prüft Trajektorien.
- **Prüfweise:** Zeile beginnt wörtlich mit „Bootstrap-Check bestanden:" und enthält alle fünf Felder mit konkreten Werten (kein Platzhalter, kein „unbekannt" außer in den definierten Zusatz-Fällen — F4s „FEHLT (F4)"-Wert zählt als definierter Zusatz-Fall, nicht als Platzhalter).

---

## 4. Definiertes Fehlverhalten

| Fall | Befund | Verhalten (verbindlich) |
|---|---|---|
| **F1** | **Regelwerk fehlt komplett** (Plugin nicht installiert, Skills nicht auffindbar) | **STOP.** Den PO informieren. Nur **Minimal-Safe-Mode** erlaubt (Definition unten). Keine Bestätigungszeile — die Session gilt als nicht gebootstrapped. **Selbstanwendungs-Sonderfall:** Im Pipeline-Repo selbst ist der Checkout die Quelle — F1 bedeutet hier nur „Plugin nicht installiert": Arbeit mit den Checkout-Dateien bleibt erlaubt (Regelwerk + Guardrails liegen als Dateien vor), Installation über die committete Selbst-Bindung (`.claude/settings.json`) bzw. `claude --plugin-dir` (§5.2) wird empfohlen. |
| **F2** | **Plugin stale** (installierter SHA ≠ Remote-HEAD) | Warnen + Refresh anbieten mit konkretem Kommando: `/plugin marketplace update agent-pipeline` und `claude plugin update pipeline-core` (bei **projekt-scoped** Installationen: `claude plugin update pipeline-core@agent-pipeline --scope project` — das unscoped Kommando schlägt dort mit „not found" fehl, Default-Scope ist user; empirisch beobachtet), danach `/reload-plugins`. Weiterarbeit erlaubt, **außer** das Delta enthält Guardrail-/Hook-Änderungen (Pfade `hooks/`, `agents/`, Permission-Vorgaben) — dann erst Refresh, dann Arbeit. Prüfweise fürs Delta: im lokalen Checkout des zentralen Repos `git fetch` + `git log --name-only <installiert>..origin/main`; ist kein Checkout vorhanden, gilt Default-Safe: **im Zweifel refreshen** (der Refresh ist billig, das Risiko veralteter Guardrails nicht). Bestätigungszeile trägt den HINWEIS-Zusatz. |
| **F3** | **Offline / Remote nicht erreichbar** | Warnen + mit Cache-Stand weiterarbeiten (der Cache ist eine vollständige Kopie, Alltagsbetrieb ist offline-fähig). Staleness-Check bei nächster Konnektivität **nachholen** (spätestens beim nächsten Bootstrap). Bestätigungszeile trägt den Offline-Zusatz. |
| **F4** | **Kalibrierungs- oder Handover-Datei fehlt** | **STOP für schreibende Arbeit.** Anlage aus dem zentralen Template anbieten (Templates liegen im Pipeline-Repo/Plugin). Read-only-Analyse bleibt erlaubt. **Die Bestätigungszeile wird trotzdem gedruckt** (F4 ist der erwartete Erstzustand, kein Bootstrap-Versagen — anders als F1): betroffenes Feld = „FEHLT (F4)" + Pflicht-Suffix, Format in Schritt 6. Neu angelegte Dateien sind dem PO zur Bestätigung zu nennen (neue Kalibrierung = Projekt-Policy-Entscheidung, kein Agenten-Alleingang). |
| **F5** | **Crash-Recovery** (Spuren eines nicht sauber geschlossenen Laufs: verwaiste Worktrees per `git worktree list`, offene WIP-/🟡-Vorgänge oder in-flight-Dispatches laut Handover, unaufgelöste „wird beim Close ergänzt"-Telemetrie-Platzhalter) | **Melden VOR Arbeitsbeginn.** Der Bootstrap scannt beim Handover-Lesen (Schritt 4) auf Worktree-Leichen und offene WIP-Vorgänge und listet Funde explizit — nie still aufräumen, nie still übergehen. Der PO bzw. der Elephant entscheidet: aufräumen, fortsetzen oder als offenen Punkt ins Handover. Danach normaler Bootstrap-Abschluss. |

**Warum F2 die Guardrail-Ausnahme hat:** Ein stales Regelwerk mit alten Hooks bedeutet, dass die Session unter **schwächeren Schutzregeln arbeitet als beschlossen** — genau der Zustand, den die Pipeline abschaffen soll. Feature-/Doku-Deltas dürfen warten, Schutz-Deltas nicht.

**Minimal-Safe-Mode (nur F1):**

- **Erlaubt:** Lesen (Read/Glob/Grep), read-only git (`status`, `log`, `diff`), Diagnose der Plugin-Installation (`/plugin`-Menü, Settings-Inspektion).
- **Verboten:** Edits/Writes, Commits, Push, Ausführung schreibender Skripte, jede Änderung an `.claude/`-Dateien oder Settings.
- **Warum:** Ohne Hook-Guardrails gibt es keine technische Durchsetzungsebene — nur Lesen ist ohne sie vertretbar.

---

## 5. Refresh-Ritual und Erstbindung je Maschine

### 5.1 Erstbindung (einmalig je Maschine je Projekt)

**Voraussetzungen (Gebot, vorher prüfen):**

1. **Online** — die Erstbindung klont das Marketplace-Repo; offline schlägt sie fehl.
2. **Credentials für das private Marketplace-Repo** vorhanden: `gh auth status` grün bzw. Git-Credential-Manager-Eintrag für github.com (auf jeder eigenen Maschine vorab prüfen).

**Ablauf:**

1. **Deterministischer Weg (empfohlen, für Kickoffs/frische Klone — skriptbar, nicht-interaktiv, idempotent, dokumentierte CLI-Subkommandos):** Projekt-Repo klonen/pullen, dann `claude plugin marketplace add {{REPO_OWNER}}/agent-pipeline --scope project` → `claude plugin install pipeline-core@agent-pipeline --scope project` (**`--scope project` ist Pflicht:** die Subkommandos verwenden standardmäßig `--scope user`, die Bindung liegt aber im Projekt-Scope, sonst „not installed at scope user") → Readback-Beweis `claude plugin list --json` (Install + Version + enabled-Status) → Session-Neustart bzw. `/reload-plugins`, dann `/pipeline-core:pipeline-start` als Ladebeweis (F1-Check).
2. **Trust-Weg — nicht verlässlich, nicht als alleiniger Mechanismus verwenden:** Ordner in Claude Code trusten KANN den Install-Prompt aus der committeten `.claude/settings.json` auslösen (`extraKnownMarketplaces` + `enabledPlugins`) — der Prompt hängt aber am Trust-Dialog-**Event**, nicht am Session-Start: ein bereits vorher getrusteter Ordner bekommt bei einer erst später committeten Bindung KEINEN Prompt (dokumentierte Lücke, GitHub-Issues #23737/#13096). Erscheint er dennoch und wird bestätigt, erfüllt das denselben Pflichtschritt wie der deterministische Weg oben — seit v2.1.195 muss ein extern bezogenes, projektseitig aktiviertes Plugin **einmal pro User explizit installiert** werden, aber nur der deterministische Weg oben erfüllt diese Pflicht ohne Prompt-Abhängigkeit; deshalb ist er Standard, nicht der Trust-Weg.
3. **Einmalig setzen:** `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` (User-Env jeder eigenen Maschine). Warum: Ohne den Schalter verwirft Claude Code bei fehlgeschlagenem `git pull` (z. B. offline ausgelöstes Update) den Marketplace-Klon — der letzte gute Stand ginge verloren.
4. Auto-Update **bewusst auf dem Default „aus" belassen.** Warum: explizite, deterministische Refreshes statt Hintergrund-Magie; der Staleness-Check (Schritt 2) macht Drift trotzdem sichtbar, und die Offline-Robustheit bleibt maximal. (⚠ UNSICHER, ob `autoUpdate` in Projekt-Settings überhaupt wirkt. Auch deshalb: nicht darauf bauen.) **Private Marketplaces:** Sollte Auto-Update je aktiviert werden, laufen dessen Hintergrund-Updates OHNE Git-Credential-Helper und brauchen `GITHUB_TOKEN`/`GH_TOKEN` in der Umgebung — sonst stiller Fehlschlag beim Start (dokumentiert, plugin-marketplaces.md §Private repositories). Manuelle Kommandos (wie der deterministische Weg oben) nutzen dagegen die normalen Git-Credentials aus den Voraussetzungen.

**Wenn der Install-Prompt ausbleibt (Zustand „Bindung committet, Projekt-Install fehlt", d. h. der Trust-Weg oben — Schritt 2 — wurde versucht und lieferte keinen Prompt):** Empirisch belegt (in einer <PROJECT_B>-Session): getrusteter Ordner + committete Bindung + reiner Session-NEUSTART lösen den Install-Prompt NICHT verlässlich aus (kostete dort einen Session-Start + Umweg). **Primärer Rettungsweg dieses Trust-Zweigs** (interaktiv, keine Improvisation): `/plugin`-Menü öffnen → Install bestätigen → `/reload-plugins`. Für Kickoffs/frische Klone ist der deterministische CLI-Weg (Schritt 1) ohnehin der Standard und umgeht dieses Prompt-Problem ganz; dieser Menü-Weg ist der verlässliche interaktive Ausweg, wenn stattdessen der Trust-Weg genutzt wurde und der Prompt ausblieb.

### 5.2 Laufendes Refresh-Ritual

| Situation | Ritual |
|---|---|
| **Normalfall** (Pipeline-Änderung wurde auf Rechner A gepusht) | Auf Rechner B beim nächsten Bootstrap meldet Schritt 2 „stale" → `/plugin marketplace update agent-pipeline` + `claude plugin update pipeline-core`, in laufender Session `/reload-plugins`. |
| **Committete Bindung, Projekt-Install fehlt** (Trust + reiner Session-Neustart lösen den Install-Prompt NICHT verlässlich aus — <PROJECT_B>-Befund) | **PRIMÄRER Weg** (s. §5.1): `/plugin`-Menü → Install bestätigen → `/reload-plugins`. |
| **Arbeit am Regelwerk selbst** (nur auf der Maschine mit aktivem Checkout des zentralen Repos) | `claude --plugin-dir <checkout>/plugins/pipeline-core` + `/reload-plugins` — die lokale Kopie überschreibt die installierte Version für die Session. Ausrollen = commit + push; die andere Maschine holt per Normalfall-Ritual nach. |
| **Nach jedem Refresh** | Bootstrap-Schritte 1–2 wiederholen (neuer SHA in der Bestätigungszeile) — sonst ist der Refresh nicht belegt. |

**Gebot:** Der Refresh ist ein **expliziter Akt mit Protokollspur** (Bestätigungszeile mit neuem SHA), kein Nebenbei-Effekt. **Warum:** In der SHA-Phase ist der Refresh-Zeitpunkt die einzige Versionsgrenze — ohne Spur ist nicht rekonstruierbar, welcher Regelwerk-Stand eine Arbeit begleitet hat (relevant für Critic-Trajektorienprüfung und Kosten-/Fehleranalyse).

**Erwartungs-Hinweis (`/reload-plugins`):** Das Kommando kann „0 skills" (bzw. eine scheinbar leere Skill-Zahl) melden, obwohl die Skills danach ganz normal aufrufbar sind (<PROJECT_B>-Befund) — das ist kein Bug-Indikator. Die Wirkung wird durch tatsächlichen Aufruf eines Skills geprüft, nicht durch die Meldung.

---

## 6. Rollen-Varianten

**Ladeprinzip (schlanker Sessionstart):** Eine Session lädt/liest NUR den Abschnitt ihrer AKTIVEN Rolle (§6.1 Elephant, §6.2 Goldfish, §6.3 Critic, ggf. §6.4/§6.5 als Elephant-Profilvarianten) — nicht den vollen Rollentext aller drei Rollen vorab. Das gilt für dieses Dokument wie für die ausführbare Form (`plugins/pipeline-core/skills/pipeline-start/SKILL.md`). Kein Schritt entfällt dadurch — es wird nur kein fremdes Rollenmaterial mehr mitgelesen. **Messbares Ziel: Kontext nach Bootstrap ≤ ~75k Tokens (gemessen per Statusline), gegenüber bisher >150k.**

| Schritt | Elephant | Goldfish | Critic |
|---|---|---|---|
| 1 Plugin-Präsenz + Stand | ✓ voll | ✓ kompakt (Guardrails aktiv? Stand = im Briefing genannter SHA) | ✓ kompakt (read-only-Toolset bestätigen) |
| 1b Modell/Effort setzen + verifizieren (inkl. `CLAUDE_CODE_SUBAGENT_MODEL` ungesetzt) | ✓ Pflicht | — entfällt (Frontmatter/Dispatch, MP-02) | — entfällt (Frontmatter/Dispatch, MP-07) |
| 1c Spend-/Usage-Check (MP-16, Limit-Vermerk einmalig) | ✓ empfohlen | — entfällt | — entfällt |
| 1d Rollen-Verbote (eingebettet, kompakt) | ✓ Pflicht | — entfällt (Verbote kommen über das Dispatch-Briefing) | — entfällt (Verbote kommen über das Dispatch-Briefing) |
| 2 Staleness-Check | ✓ Pflicht | — entfällt (Stand hat der Elephant beim Dispatch fixiert) | — entfällt |
| 3 Kalibrierung | ✓ Pflicht | ✓ soweit im Briefing referenziert | teilweise: nur Guardrail-/Constraint-Anteile als Prüfmaßstab |
| 4 Handover/State | ✓ Pflicht (vollständig) | **✗ Verbot** — Briefing ersetzt Handover | **✗ Verbot** — kein Handover, kein Verlauf |
| 5 verify-Gates | ✓ Pflicht | ✓ Pflicht (braucht es für Evidenz) | — entfällt (Critic führt keine Gates aus, er prüft deren Evidenz) |
| 6 Bestätigung | ✓ voll + Zusatzzeile | ✓ kompakt (eine Zeile) | ✓ kompakt (eine Zeile) |

### 6.1 Elephant-Bootstrap (voll)

Alle Pflicht-Schritte inklusive **1b** (Modell/Effort gemäß model-policy setzen und verifizieren — Effort `xhigh` ist session-only; `CLAUDE_CODE_SUBAGENT_MODEL` ungesetzt bestätigen) und **1d** (Rollen-Verbote, s. u.); dazu — optional-empfohlen, kein Pflichtteil — **1c** (Spend-/Usage-Check: gesetztes/nahes Limit einmalig dokumentieren). Zusätzlich, gemäß MP-17 („Modell + Effort am Sessionanfang fixieren") und der Profil-/Advisor-Erweiterung aus Schritt 1b, eine **zweite Zeile** direkt unter der Bestätigung:

> Modell/Effort: {{MODEL}} / {{EFFORT}} (gemäß policies/model-policy.md) · Profil {{advisor|design-first|PO-Ausnahme}} · Advisor {{ADVISOR|aus}}

Direkt darunter, gemäß **1d**, eine **dritte Zeile**:

> „Rollen-Verbote geladen: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — Implementierung nur per Goldfish-Dispatch (Stufe-0 per OM §3.3; weitere Ausnahmen nur durch den PO); PRD-Gate: lesbar vorlegen + auf ‚freigegeben' warten"

Der Elephant muss außerdem zur Session-Lifecycle-Politik auskunftsfähig sein (Elephant-Erhalt bei vollem Kontext, Goldfish-Kadenz — Pflichtteil des Operating Model, → docs/operating-model.md); der Bootstrap lädt dafür keine Zusatzdateien, die Politik kommt mit dem Regelwerk.

### 6.2 Goldfish-Bootstrap (Briefing statt Handover)

- **Das Briefing des Elephant ersetzt die Handover-Lektüre.** Verbot: Handover-/State-Datei oder Verlaufsartefakte lesen. Warum: Kontext-Ökonomie und Kontrakt-Klarheit — das Briefing (Ziel · Kontext-Dateien · DoD-Checks · Verbote · Stop-Bedingungen · Dispatch-Metadaten; kanonische Feldliste: docs/operating-model.md §2.3) ist der vollständige Auftrag; was nicht drinsteht, gehört nicht in den Goldfish-Kontext.
- Das Briefing **muss den Regelwerk-SHA nennen** (Pflichtfeld „Dispatch-Metadaten", → docs/operating-model.md §2.3), unter dem dispatcht wurde; der Goldfish übernimmt ihn in seine Bestätigung (kein eigener Remote-Check — Netz-/Zeitkosten liegen beim Elephant, einmal pro Dispatch-Welle statt einmal pro Goldfish).
- **Kompakte Bestätigung** (eine Zeile, Feld „Stand" trägt die Briefing-Referenz):

  > „Bootstrap-Check bestanden: Regelwerk \<SHA aus Briefing\> geladen · Projekt \<name\> · Kalibrierung \<datei\> · Stand Briefing \<task-id/datum\> · Rolle Goldfish"

- **Prüfweise:** Fehlt der SHA im Briefing, ist das ein Briefing-Mangel → zurück an den Elephant (Stop-Bedingung), nicht selbst recherchieren.

### 6.3 Critic-Bootstrap (nur Spec + Diff + Guardrails)

- **Input ist abschließend definiert:** Spec, Diff, Guardrails/Constraints (inkl. relevanter Kalibrierungs-Anteile als Prüfmaßstab) und die Evidenz-Artefakte des Prüflings. **Explizit KEIN Handover, KEIN Chat-Verlauf, KEINE Implementor-Begründungen.** Warum: Der Critic soll unabhängig urteilen — Verlaufskontext erzeugt genau die Ankereffekte, die er neutralisieren soll.
- Kein Staleness-Check: Der Critic prüft gegen den Stand, den ihm der Auftrag nennt; Aktualität des Regelwerks zu sichern ist Elephant-Pflicht.
- Bestätigung, dass **keine Schreib-Tools** verfügbar sind (read-only Subagent, ggf. `--bare`-Stufe für kritische Diffs) — ist Schreiben möglich, ist der Bootstrap gescheitert (falsche Agent-Definition geladen).
- **Kompakte Bestätigung** (Feld „Stand" entfällt bewusst):

  > „Bootstrap-Check bestanden: Regelwerk \<SHA aus Auftrag\> geladen · Projekt \<name\> · Kalibrierung \<datei|n/a\> · Stand n/a (Critic sieht keinen Verlauf) · Rolle Critic"

### 6.4 Kurz-Bootstrap (Same-Day-Light-Bootstrap, Elephant)

**Voraussetzungen (ALLE müssen zutreffen, sonst voller Bootstrap):**

1. Gleiche Maschine UND gleicher Kalendertag wie ein dokumentierter VOLLER Bootstrap (Beleg: der oberste Session-Block der Handover-Datei des Projekts verzeichnet diesen Bootstrap mit Datum).
2. Geladener Regelwerk-SHA unverändert gegenüber diesem vollen Bootstrap.
3. Kein Plugin-Refresh/-Reload seither (nach jedem F2-Refresh oder `/reload-plugins` gilt zwingend wieder der volle Pfad — unveränderter Kontrakt).

**Leichtform** (weicht NUR wie folgt vom Vollpfad in §3 ab; alle nicht genannten Schritte laufen unverändert):

- **Schritt 1:** nur lokaler SHA (kein `ls-remote`).
- **Schritt 1b:** unverändert (Pflicht) — **die Profil-Frage wird bei JEDEM Bootstrap wiederholt**, auch im Kurz-Pfad: sie ist billig (eine UI-Frage) und ein Profilwechsel mitten am Tag ist ohnehin eine neue Session.
- **Schritt 1d:** unverändert (eingebettet, billig).
- **Schritt 2:** ÜBERSPRUNGEN, mit Pflicht-Suffix `· Staleness same-day gecacht (voller Check <HH:MM>)` (siehe Schritt 6, Liste der erlaubten Zusätze).
- **Schritt 3:** nur Existenz-Check.
- **Schritt 4:** nur Handover-HEAD-Block + oberster Session-Block — AUSSER die Handover-Datei hat sich seit dem vollen Bootstrap geändert (neuere Commits/Datum) → dann vollständige Lektüre.
- **Schritt 5:** nur Existenz-Check.
- **Schritt 6:** Bestätigungszeile wie gewohnt + der Suffix aus Schritt 2 oben.

**Warum:** Ein am selben Tag auf derselben Maschine bereits vollständig durchgeführter Bootstrap macht die teuren Prüfschritte (Remote-Staleness, volle Handover-Lektüre) redundant — SOFERN Regelwerk-Stand und Handover-Stand seither nachweislich unverändert sind; die drei Voraussetzungen sind die Nachweispflicht dafür, keine Abkürzung nach Gefühl.

### 6.5 Speed-Bootstrap (Mini-Feature/Hotfix, Elephant)

**Herkunft:** dritte Profiloption neben `advisor`/`design-first` in Schritt 1b (§3) — für genuinely kleine, eng begrenzte Diffs (Mini-Feature/Hotfix), nicht für Architektur-/Guardrail-Arbeit.

**Voraussetzung:** Der PO wählt in der Schritt-1b-Profilfrage die Option `speed`. Anders als der Kurz-Bootstrap (§6.4) ist Speed NICHT an „gleicher Tag/gleiche Maschine" gebunden — es ist eine Zuschnittsfrage des Tasks (Mini-Feature/Hotfix), keine Cache-Frische-Frage.

**Geltungsbereich (harte Grenzen — Bruch löst Pflicht-Eskalation aus):**

- Nur für Mini-Feature-/Hotfix-Umfang: **~≤5 betroffene Dateien.**
- **KEINE Guardrail-/Kanon-Dateien** im Scope (`guardrails/*`, `docs/operating-model.md`, `roles/*`, `policies/*`, jeder Hook unter `plugins/pipeline-core/hooks/*`, `.claude/settings.json`, Guard-Config).
- **Keine neuen Abhängigkeiten.**
- Wird eine dieser Grenzen während der Session sichtbar (Scope wächst über den Zuschnitt hinaus): **Pflicht-Eskalation ins Vollprofil** — sofort auf den vollen Bootstrap/vollen Prozess wechseln, nicht im Speed-Pfad weiterarbeiten (Eskalationslogik analog `harness/checklists/small-session.md`, Abschnitt „Escalation rule").
- **Die Guard-Hooks bleiben in JEDEM Profil, auch `speed`, uneingeschränkt aktiv** (deterministisch, kostenlos) — Speed spart Zeremonie, nicht Sicherheit.

**Leichtform des Bootstraps** (weicht NUR wie folgt vom Vollpfad in §3 ab; alle nicht genannten Schritte laufen unverändert bzw. entfallen wie unten spezifiziert):

- **Schritt 1:** nur lokaler Regelwerk-SHA (kein `ls-remote`).
- **Schritt 1b:** die Profilfrage selbst läuft normal (das IST bereits die Speed-Wahl); danach ENTFÄLLT die Advisor-Hygiene-Prüfung und die Bereitschaftsprobe (beide sind `advisor`-Profil-spezifisch) — Modell/Effort/Advisor-Pairing ist im Speed-Profil fix (`policies/model-policy.md`, MP-28), einmal gesetzt, keine Zusatzfragen.
- **Schritt 1c:** entfällt (kein Spend-/Usage-Check als eigener Akt).
- **Schritt 1d:** entfällt als eigene Bestätigungszeile — die Rollen-Verbote (EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19) gelten inhaltlich unverändert, werden im Speed-Pfad nur nicht als eigene Zeile wiederholt.
- **Schritt 2:** entfällt vollständig (kein Remote-Staleness-Check).
- **Schritt 3:** nur Existenz-Check der Kalibrierungsdatei (kein Vollständig-Lesen).
- **Schritt 4:** nur der operative Kopf der Handover-Datei (kein vollständiges Lesen der Session-Historie).
- **Schritt 5:** nur Existenz-/Aufrufbarkeits-Check von verify.
- **Schritt 6:** **EINE Bestätigungszeile statt drei** (Format → Schritt 6, Suffix „· Profil speed — Leicht-Bootstrap").

**Leichter Prozess** (nicht nur der Bootstrap — gilt für den ganzen Task): kein PRD-Dokument; direkter Dispatch, oder bei ganz kleinen Fixes ein Mini-Edit (Stufe-0-Fast-Path per `docs/operating-model.md` §3.3); leichte Review-Stufe statt vollem Design-Tier-Review — die bestehende Critic-Trigger-Matrix entscheidet wie gehabt, nicht neu erfunden (→ `harness/checklists/small-session.md` Schritt 3); Kurz-Abschluss über die **close-light-Variante** des `close-block`-Skills (`plugins/pipeline-core/skills/close-block/SKILL.md`) — deren eigenes hartes Eligibility-Gate gilt unverändert, Speed übersteuert es nicht.

**Warum:** Für ein Mini-Feature oder einen Hotfix lief bislang dieselbe schwere Zeremonie wie für einen Architektur-Umbau — die überschrittene Proportionalitäts-Leitplanke. Speed spart die Zeremonie, ohne eine einzige deterministische Guardrail zu berühren.

---

## 7. Offene Punkte

- **TEILERLEDIGT:** Maschinenlesbare Quelle für den installierten Plugin-SHA ist auf dem Haupt-PC verifiziert: `~/.claude/plugins/installed_plugins.json`, Feld `gitCommitSha` (Details → Schritt 1). Die Quellen-Nennung im `/pipeline-core:pipeline-start`-Skill ist nachgezogen. **OFFEN bleibt nur die Laptop-Gegenprobe** (Zwei-Rechner-Validierung, Sprint 1).
- **ERLEDIGT:** SessionStart-Hook verdrahtet — `plugins/pipeline-core/hooks/staleness-check.mjs` (Matcher `startup|resume|clear`, Timeout 15 s, fail-open, read-only) injiziert die Bootstrap-Aufforderungszeile (Verankerung 1) und bei Staleness den SHA-Befund (Schritt-2-Substitution, s. dort); T1-Critic-Pfad durchlaufen. Offen nur noch Zwei-Rechner-E2E (Laptop; Sprint 1).
- **Entschieden:** Mechanismus und Feldskizze der Projekt-Kalibrierungsdatei stehen in docs/operating-model.md §8 (Arbeitsname `.claude/pipeline.json`). **Schema-Format entschieden (mit der Plugin-Lieferung):** JSON (`.claude/pipeline.json`); die Skills `pipeline-start`/`close-block` lesen dieses Format.
- **Entschieden:** Handover-Datei kanonisch (Konvention `docs/state.md`), Verhältnis zu HISTORY festgeschrieben — → docs/operating-model.md §6 + ADR-0012. **OFFEN (Phase 4):** nur noch das Handover-Template + der endgültige Template-Name je Projekt.
- **ERLEDIGT:** Schwellwert des Handover-Drift-Checks (Schritt 4) kalibriert — Default „HEAD neuer als Handover UND ≥1 Nicht-Doku-Commit im Delta", per-Projekt-Override via `$driftThreshold` in `.claude/pipeline.json`.
- **⚠ UNSICHER:** Ob `autoUpdate` am `extraKnownMarketplaces`-Eintrag außerhalb managed settings wirkt — deshalb setzt dieses Protokoll auf explizite Refreshes; falls sich die Doku-Lage ändert, Ritual in §5 neu bewerten.
