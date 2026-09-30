---
schema: pipeline.backlog-item.v1
id: pipeline.model-family-approval-with-automatic-version-upgrades
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-30
source: "Explicit PO direction: approve new model types once; automatically select their latest version; retain old versions only on explicit PO request."
sprint: alfred
done_when: manual
---

# Modellfamilien einmal freigeben, neue Versionen automatisch verwenden

PO-Auftrag: Die Pipeline muss den Wechsel selbst ausführen, nicht nur vorschlagen. Die heutige Exact-ID-Policy verlangt auch für Versionswechsel eine neue Freigabe; diese Grenze muss auf Modelltypen statt Versionen umgebaut werden.

## Abnahme

- Neue Modelltypen benötigen einmalig eine ausdrückliche PO-Zuordnung zu Rollen und Aufgaben; Versionen derselben freigegebenen Familie übernehmen diese Zuordnung automatisch.
- `gpt-6-sol` → `gpt-6.1-sol` und `gpt-5.6-luna` → `gpt-6-luna` erfolgen automatisch ohne neue Signatur oder Zuordnungsbestätigung; numerisch neueste verfügbare Version gewinnt unabhängig von Katalogreihenfolge.
- Nur ein ausdrücklicher PO-Pin darf eine ältere Version festlegen; neue Typen, Umbenennungen oder andere Familien dürfen nie allein aus Namensähnlichkeit zugeordnet werden.
- Bootstrap und neue Dispatches verwenden dieselbe Auswahlregel; alle Luna-Routen ziehen auf die aktuelle Luna-Version. Laufende Aufrufe und historische Modellbelege werden nicht umgeschrieben.
- Echte Runner-Verfügbarkeit und benötigter Effort bleiben überprüft; unbekannte Versionierung, unvollständige Kataloge und fehlende aktuelle Modelle liefern einen konkreten Fehler statt einer stillen alten oder fremden Zuordnung.
- Migration bestehender signierter Exact-ID-Policies bewahrt deren Beweis und verlangt keine neue Versionsfreigabe; Familienzuordnung, expliziter Pin und tatsächlich gewählte ID bleiben prüfbar. Neue und entfernte Rollenslots bleiben eigene Entscheidungen.
- Regressionen prüfen beide genannten Wechsel, `6.2` gegen `6.10`, Pin und Pin-Aufhebung, neue Familie, fehlenden Effort, Offline/Compact, echte Dispatch-ID und alle drei Runner. Source, Installed-Host und Kandidatenabnahme sind getrennt nachzuweisen.
