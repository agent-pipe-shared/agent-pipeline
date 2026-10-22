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

## PO decision D99 (2026-10-22): versions inside a family are automatic, a new family is the PO's call

Decision register: `specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md` row D99. Within one model family (for
example Opus, Sonnet, Haiku) the newest version is selected automatically, without a new confirmation. Only a NEW
family needs the PO's decision. This item's rule therefore stands as written; it is the authoritative rule for version bumps. The opposed item `2026-10-16-model-role-bootstrap-ignores-version-bumps-within-a-family` is amended accordingly (its "propose, then accept" acceptance applies to a new family only).

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Decide the D66 typed-pending row for the model-family cases
  D66 already decided it: the typed latent reds MFHS002-008, MFHS023, MFHS028, MFI012, MFI013, MFMP003 become typed pending cases naming their backlog item; D99 settles the version rule and D113 builds the settled journal. No decision is missing.
- **HOST-SESSION-NEEDED** — Installed-host acceptance on qualified Codex, Claude and Antigravity runners (pin case C5, real dispatch id, Offline/Compact)
  Needs a real dispatch id from an installed Codex, Claude and Antigravity session (authenticated model turns, Offline/Compact on the host); observed: the automatically selected newest family version in the real dispatch. No agent may drive these.
