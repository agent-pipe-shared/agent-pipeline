---
schema: pipeline.backlog-item.v1
id: pipeline.hooks-enforce-available-parallel-dispatch
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-01
source: "Explicit PO direction: hooks must detect missed parallelization and require the Elephant to dispatch independent work in parallel."
sprint: none
done_when: manual
---

# Hooks verpflichten den Elephant zur verfügbaren Parallelisierung

Nach dem lokalen 0.7-Kandidaten umsetzen; noch keinem Sprint zugeordnet.
Der Elephant soll unabhängige Arbeit bei freien Worker-Plätzen tatsächlich parallel dispatchen. Die Hooks müssen unnötige serielle Ausführung erkennen und explizit unterbinden, statt nur einen Hinweis zu geben.

## Abnahme

- Die Prüfung verwendet verfügbare Runner-Kapazität, laufende Dispatches, Abhängigkeiten und getrennte Datei-/Zustandsverantwortung; angekündigte Dispatches gelten nicht als laufende Arbeit.
- Bei parallel ausführbaren Aufgaben und freien Plätzen erzwingt sie einen konkreten parallelen Dispatch, bevor der Elephant dieselbe Arbeit seriell fortsetzt.
- Echte Abhängigkeiten, gemeinsame Schreibflächen, ausgeschöpfte Kapazität und fehlende Runtime-Unterstützung bleiben nachvollziehbare Ausnahmen; der Agent muss dazu überprüfbare Gründe liefern.
- Claude, Codex und AGY werden an ihren tatsächlich unterstützten Laufzeitgrenzen geprüft. Regressionen belegen erzwungene Parallelisierung und zulässige serielle Fälle, ohne fremde Hook-Integration vorzutäuschen.
