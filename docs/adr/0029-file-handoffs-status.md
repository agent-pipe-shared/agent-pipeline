# ADR-0029: File-Handoffs & Status — `pipeline-state.json`, Plan-Artefakte, Evidenz-Frische statt Selbstberechnung

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Leitentscheidung 3, [ADR-0012](0012-handover-kanonisierung.md), `guardrails/quality-gates.md` QG-03

## Kontext

Die beiden neuen Gates ([ADR-0027](0027-gate-philosophie.md)) brauchen einen deterministischen, git-committeten Zustand — „ist die Plan-Freigabe schon verbucht?", „wurde dieser Push schon genehmigt?" — der weder Chat-Gedächtnis noch eine freihändig editierte Datei sein darf (genau die Art von stiller, unauditierbarer Zustandsänderung, die die Gates verhindern sollen). Zugleich fehlte ein einheitlicher Ablageort für Plan-Artefakte selbst.

## Entscheidung

1. **`.claude/pipeline-state.json`** (Schema `pipeline.state.v0`) wird **AUSSCHLIESSLICH** über die CLI `harness/scripts/pipeline-state.mjs` geschrieben — nie handeditiert. Subcommands: `set-feature`, `set-phase`, `approve-plan --by <name>`, `revoke-plan --by <name>`, `approve-push --by <name>` (Letzteres verbucht `forCommit` = aktueller `git rev-parse HEAD`). Alle `--by`-Subcommands verweigern ein leeres/fehlendes `--by` (Exit 2, deutsche Fehlermeldung) — eine unattribuierte Freigabe wäre exakt die unauditierbare Zustandsänderung, die diese CLI verhindern soll. Die Datei ist git-committet und pretty-printed (JSON, `null, 2`) — sie IST der Audit-Trail, nicht nur ein Laufzeit-Cache (gleiche Philosophie wie `.claude/guard-override.log.jsonl`).
2. **Restrisiko benannt (wie Guard-Override):** Die CLI ist technisch nicht gegen agentischen Missbrauch gehärtet (ein Agent könnte theoretisch die Datei dennoch direkt editieren, außerhalb der CLI). Die Absicherung ist **prozedural + git-forensisch**: jede Zustandsänderung landet als eigener, attribuierter Commit in der Historie; ein Freihand-Edit außerhalb der CLI wäre im Diff sichtbar (fehlendes `schema`/`planApproval`-Muster, keine CLI-Signatur) und damit im Critic-/Review-Blick auffindbar — genau die Konstruktion, die [ADR-0013](0013-git-guard-union.md)/E11 für den Guard-Override-Mechanismus bereits etabliert hat.
3. **Plan-Artefakte** leben unter `.claude/plans/<feature>.md` (Template: `templates/dev-plan.md`) — ein einheitlicher, versionierter Ablageort statt Ad-hoc-Chat-Freigaben oder verstreuter Spec-Varianten.
4. **Gates prüfen EVIDENZ-FRISCHE, nie selbst rechnen** (10-Sekunden-Hook-Budget): Der Push-Gate-Hook liest `evidence/verify-latest.json` und (falls das Manifest eine Security-Gate deklariert) `evidence/security-latest.json` — geprüft wird jeweils nur `exitCode === 0` UND `commit === aktueller HEAD` (`git rev-parse HEAD`). Der Hook führt selbst NIE `verify` oder den Security-Scan aus — er liest nur, ob bereits geprüft wurde und ob dieser Stand noch aktuell ist.
5. **Stop-Hook `stop-suggest.mjs`** schlägt am Ende jedes Haupt-Session-Turns nicht-blockierend die nächste Phase/das nächste Gate vor, gespeist aus Manifest + State (`activeFeature.phase` → Phasenfolge → zugehöriges Gate). Fail-open bei fehlendem/kaputtem Manifest oder State (silent exit 0) — kein Rauschen ohne Manifest.

## Konsequenzen

**Positiv:** Ein einziger, git-forensisch nachvollziehbarer Zustandsschreiber statt N möglicher Freihand-Edits; Gates bleiben im 10-Sekunden-Hook-Budget, weil sie nie selbst rechnen, nur lesen; die Stop-Hook-Suggestion senkt die Reibung, ohne einen weiteren blockierenden Mechanismus einzuführen.

**Negativ:** Ein weiterer CLI-Baustein, den jede Session kennen muss (`approve-plan`/`approve-push` statt „einfach die Datei anpassen"); die Evidenz-Frische-Prüfung ist nur so gut wie die zugrunde liegenden `verify`-/Security-Läufe — ein manipuliertes Evidenz-Artefakt außerhalb dieser CLI bliebe von den Gates unbemerkt (identisches Restrisiko wie bei QG-03s Evidenz-Schreiber-Kontrakt).

**Risiko:** Wie bei jedem Guard-Override-artigen Mechanismus bleibt die Absicherung prozedural statt technisch wasserdicht — bewusst in Kauf genommen und hier wie dort ehrlich benannt (kein „vollständig sicher"-Overclaim).

## Verworfene Alternativen

- **Chat-/Session-Gedächtnis als Freigabe-Nachweis** — verworfen; widerspricht dem Grundprinzip „was nur im Chat existiert, existiert nicht" (`docs/operating-model.md` §5.1).
- **Direktes Freihand-Editieren von `pipeline-state.json` erlauben** — verworfen; genau die unauditierbare Zustandsänderung, die die CLI verhindern soll.
- **Gates berechnen `verify`/Security-Scan selbst statt Evidenz zu lesen** — verworfen; sprengt das 10-Sekunden-Hook-Budget und dupliziert die Gate-Kette (QG-02, EIN Gate-Kommando).
- **Verpflichtender Plugin-Guard gegen jede `pipeline-state.json`-Direktschreibung** — zurückgestellt (kein Plugin-Zwang); je Projekt als empfohlene `guard-config`-Ergänzung dokumentiert, kein hartes Muss dieser Lieferung.

## Wiedervorlage

Empfohlene projektspezifische `guard-config`-Ergänzung gegen Direkt-Edits von `pipeline-state.json`: OFFEN, kein Plugin-Zwang (Risiken-Abschnitt des AP1-Plans).
